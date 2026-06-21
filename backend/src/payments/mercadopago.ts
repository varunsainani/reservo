import crypto from "crypto";
import type { Request } from "express";
import {
  PaymentProviderType,
  PaymentStatus,
  PaymentMethod,
} from "@prisma/client";
import type { Booking, Payment } from "@prisma/client";
import { env } from "../lib/env";
import type { CheckoutResult, PaymentProvider, VerifiedWebhook } from "./types";
import { WebhookAuthError } from "./types";

/**
 * Real MercadoPago integration (Checkout Pro preference + Pix) — fully
 * implemented but OFF by default (selected only when PAYMENT_PROVIDER=mercadopago).
 * Uses the public REST API via global fetch (Node >=18), no SDK dependency.
 *
 * Docs:
 *  - Preferences:   POST https://api.mercadopago.com/checkout/preferences
 *  - Payments:      GET  https://api.mercadopago.com/v1/payments/{id}
 *  - Webhook HMAC:  x-signature (ts + v1) over `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
export class MercadoPagoProvider implements PaymentProvider {
  readonly kind = PaymentProviderType.MERCADOPAGO;
  private readonly base = "https://api.mercadopago.com";

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };
  }

  async createCheckout(
    booking: Booking,
    payment: Payment
  ): Promise<CheckoutResult> {
    if (!env.MERCADOPAGO_ACCESS_TOKEN) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured");
    }

    const notificationUrl = `${env.APP_URL}/api/webhooks/payments`;
    const backBase = `${env.APP_URL}/booking/${booking.id}?token=${booking.publicToken}`;

    const preference = {
      items: [
        {
          id: booking.serviceId,
          title: `Reservo — ${booking.id}`,
          quantity: 1,
          currency_id: booking.currency,
          unit_price: Number((booking.priceCents / 100).toFixed(2)),
        },
      ],
      external_reference: payment.id,
      notification_url: notificationUrl,
      back_urls: {
        success: backBase,
        pending: backBase,
        failure: backBase,
      },
      auto_return: "approved",
      payment_methods: {
        // Pix + card both enabled; exclude nothing.
        excluded_payment_types: [],
      },
      metadata: {
        bookingId: booking.id,
        paymentId: payment.id,
        publicToken: booking.publicToken,
      },
    };

    const res = await fetch(`${this.base}/checkout/preferences`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(preference),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MercadoPago preference failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    const checkoutUrl =
      data.init_point ?? data.sandbox_init_point ?? `${env.APP_URL}/checkout/${booking.id}`;

    return {
      checkoutUrl,
      pixQr: null, // Pix QR is fetched on the payment record after creation in real flows.
      externalId: data.id,
    };
  }

  async verifyWebhook(req: Request): Promise<VerifiedWebhook | null> {
    // 1) Verify HMAC signature when a webhook secret is configured.
    if (env.MERCADOPAGO_WEBHOOK_SECRET) {
      this.assertSignature(req);
    }

    // 2) Extract the payment id from query (?id=) or body (data.id).
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data = (body.data ?? {}) as Record<string, unknown>;
    const queryId =
      typeof req.query.id === "string" ? req.query.id : undefined;
    const dataId =
      typeof data.id === "string"
        ? data.id
        : typeof data.id === "number"
          ? String(data.id)
          : undefined;
    const paymentId = queryId ?? dataId;
    const topic =
      (typeof req.query.topic === "string" && req.query.topic) ||
      (typeof body.type === "string" && body.type) ||
      (typeof body.action === "string" && body.action) ||
      "payment";

    // Only payment notifications matter for our confirm pipeline.
    if (!paymentId || !String(topic).includes("payment")) return null;

    // 3) Fetch the authoritative payment from MercadoPago.
    const res = await fetch(`${this.base}/v1/payments/${paymentId}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      // Unknown / not-yet-available payment → no-op (caller returns 200).
      return null;
    }
    const payment = (await res.json()) as {
      id: number | string;
      status: string;
      payment_type_id?: string;
      payment_method_id?: string;
    };

    return {
      externalId: String(payment.id),
      status: mapMpStatus(payment.status),
      method: mapMpMethod(payment.payment_type_id ?? payment.payment_method_id),
      type: `payment.${payment.status}`,
      raw: payment,
    };
  }

  private assertSignature(req: Request): void {
    const signature = req.header("x-signature");
    const requestId = req.header("x-request-id") ?? "";
    const dataId =
      (typeof req.query.id === "string" && req.query.id) ||
      ((req.body as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined)?.id;

    if (!signature || dataId === undefined) {
      throw new WebhookAuthError();
    }

    // x-signature: "ts=<unix>,v1=<hmac-hex>"
    const parts = Object.fromEntries(
      signature.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k.trim(), (v ?? "").trim()];
      })
    ) as Record<string, string>;

    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) throw new WebhookAuthError();

    const manifest = `id:${String(dataId)};request-id:${requestId};ts:${ts};`;
    const expected = crypto
      .createHmac("sha256", env.MERCADOPAGO_WEBHOOK_SECRET)
      .update(manifest)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new WebhookAuthError();
    }
  }
}

function mapMpStatus(status: string): PaymentStatus {
  switch (status) {
    case "approved":
      return PaymentStatus.APPROVED;
    case "rejected":
    case "cancelled":
      return PaymentStatus.REJECTED;
    case "refunded":
    case "charged_back":
      return PaymentStatus.REFUNDED;
    case "pending":
    case "in_process":
    case "authorized":
      return PaymentStatus.PENDING;
    default:
      return PaymentStatus.PENDING;
  }
}

function mapMpMethod(type: string | undefined): PaymentMethod | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes("pix") || t.includes("bank_transfer")) return PaymentMethod.PIX;
  if (
    t.includes("credit") ||
    t.includes("debit") ||
    t.includes("card")
  ) {
    return PaymentMethod.CARD;
  }
  return null;
}
