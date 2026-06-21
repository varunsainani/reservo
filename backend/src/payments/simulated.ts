import crypto from "crypto";
import type { Request } from "express";
import { PaymentProviderType, PaymentStatus, PaymentMethod } from "@prisma/client";
import type { Booking, Payment } from "@prisma/client";
import { env } from "../lib/env";
import type { CheckoutResult, PaymentProvider, VerifiedWebhook } from "./types";
import { WebhookAuthError } from "./types";

/**
 * Simulated provider. The "checkout" is a frontend page; paying POSTs back to
 * the real webhook so the confirm pipeline is exercised honestly (no external
 * account). The token guards the webhook in lieu of a signature.
 */
export class SimulatedProvider implements PaymentProvider {
  readonly kind = PaymentProviderType.SIMULATED;

  async createCheckout(
    booking: Booking,
    _payment: Payment
  ): Promise<CheckoutResult> {
    const externalId = `sim_${crypto.randomBytes(10).toString("hex")}`;
    const checkoutUrl = `${env.APP_URL}/checkout/${booking.id}?token=${booking.publicToken}`;
    // Mock Pix "copia e cola" payload — looks like a real BR Code without being one.
    const pixQr = buildMockPix(booking);
    return { checkoutUrl, pixQr, externalId };
  }

  /**
   * Accepts the token either via `x-simulated-token` header or in the JSON body
   * (`token`). Body must carry { externalId, outcome|status, method? }.
   */
  async verifyWebhook(req: Request): Promise<VerifiedWebhook | null> {
    const headerToken = req.header("x-simulated-token");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const bodyToken = typeof body.token === "string" ? body.token : undefined;
    const token = headerToken ?? bodyToken;

    if (!token || !safeEqual(token, env.SIMULATED_WEBHOOK_TOKEN)) {
      throw new WebhookAuthError();
    }

    const baseExternalId =
      typeof body.externalId === "string" ? body.externalId : undefined;
    if (!baseExternalId) return null;

    const status = mapOutcome(body.outcome ?? body.status);
    if (!status) return null;

    const method = mapMethod(body.method);

    // The ledger (idempotency) key includes the outcome so a later approval
    // after a rejection is a DISTINCT WebhookEvent row and IS applied, while
    // replaying the SAME outcome stays idempotent. The payment lookup still uses
    // the stable base id stored on Payment.externalId.
    const ledgerExternalId = `${baseExternalId}_${outcomeToken(status)}`;

    return {
      externalId: ledgerExternalId,
      paymentExternalId: baseExternalId,
      status,
      method,
      type: typeof body.type === "string" ? body.type : "payment.updated",
      raw: body,
    };
  }
}

/** Stable per-outcome token for the simulated ledger key. */
function outcomeToken(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.APPROVED:
      return "approved";
    case PaymentStatus.REJECTED:
      return "rejected";
    case PaymentStatus.EXPIRED:
      return "expired";
    default:
      return "updated";
  }
}

function mapOutcome(v: unknown): PaymentStatus | null {
  if (typeof v !== "string") return null;
  switch (v.toLowerCase()) {
    case "approved":
    case "approve":
    case "paid":
      return PaymentStatus.APPROVED;
    case "rejected":
    case "reject":
    case "failed":
      return PaymentStatus.REJECTED;
    case "expired":
      return PaymentStatus.EXPIRED;
    default:
      return null;
  }
}

function mapMethod(v: unknown): PaymentMethod | null {
  if (typeof v !== "string") return null;
  const m = v.toUpperCase();
  if (m === "PIX") return PaymentMethod.PIX;
  if (m === "CARD") return PaymentMethod.CARD;
  return null;
}

function buildMockPix(booking: Booking): string {
  // Deterministic, clearly-mock BR Code-shaped string.
  const amount = (booking.priceCents / 100).toFixed(2);
  const tail = booking.publicToken.slice(0, 12).toUpperCase();
  return `00020126RESERVO-SIM-PIX${tail}5204000053039865406${amount}5802BR6009RESERVO6304MOCK`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
