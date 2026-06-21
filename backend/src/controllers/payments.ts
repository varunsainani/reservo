import type { Request, Response } from "express";
import {
  BookingStatus,
  PaymentProviderType,
  PaymentStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { httpError } from "../lib/http-error";
import { env } from "../lib/env";
import { audit } from "../lib/audit";
import { simulatePaymentSchema } from "../lib/validation";
import { getPaymentProvider, WebhookAuthError } from "../payments";
import { processPaymentWebhook } from "../services/payments";

// POST /api/payments/simulate
// Clean client-facing entry for the SIMULATED provider: validates the booking's
// public token, then drives the SAME webhook-processing function with a signed
// simulated event.
export async function simulatePayment(
  req: Request,
  res: Response
): Promise<void> {
  const body = simulatePaymentSchema.parse(req.body);

  const booking = await prisma.booking.findUnique({
    where: { id: body.bookingId },
    include: { payment: true },
  });

  if (!booking || booking.publicToken !== body.token) {
    // No enumeration.
    throw httpError(404, "errors.booking.bookingNotFound", {
      code: "BOOKING_NOT_FOUND",
    });
  }
  if (!booking.payment) {
    throw httpError(404, "errors.payment.paymentNotFound", {
      code: "PAYMENT_NOT_FOUND",
    });
  }
  if (booking.payment.provider !== PaymentProviderType.SIMULATED) {
    // Simulate only applies to the simulated provider.
    throw httpError(400, "errors.payment.invalidOutcome", {
      code: "INVALID_PROVIDER",
    });
  }
  if (!booking.payment.externalId) {
    throw httpError(409, "errors.payment.paymentNotFound", {
      code: "PAYMENT_NOT_READY",
    });
  }

  const status =
    body.outcome === "approved"
      ? PaymentStatus.APPROVED
      : PaymentStatus.REJECTED;
  const method =
    body.method ?? (body.outcome === "approved" ? "PIX" : undefined);

  const result = await processPaymentWebhook({
    provider: PaymentProviderType.SIMULATED,
    externalId: booking.payment.externalId,
    status,
    method: method ?? null,
    type: `simulated.${body.outcome}`,
    raw: {
      source: "simulate",
      bookingId: booking.id,
      outcome: body.outcome,
      token: env.SIMULATED_WEBHOOK_TOKEN ? "present" : "absent",
    },
    locale: req.locale,
  });

  res.status(200).json({ ok: true, applied: result.applied, duplicate: result.duplicate });
}

// POST /api/webhooks/payments
// The real webhook. Always 200 unless the signature/token is invalid (401).
export async function paymentsWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const provider = getPaymentProvider();

  let event;
  try {
    event = await provider.verifyWebhook(req);
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      throw httpError(401, "errors.payment.invalidToken", {
        code: "INVALID_WEBHOOK_TOKEN",
      });
    }
    throw e;
  }

  if (!event) {
    // Irrelevant / unparseable payload → acknowledge, no-op.
    res.status(200).json({ ok: true, applied: "noop" });
    return;
  }

  const result = await processPaymentWebhook({
    provider: provider.kind,
    externalId: event.externalId,
    status: event.status,
    method: event.method ?? null,
    type: event.type,
    raw: event.raw,
    locale: req.locale,
  });

  res.status(200).json({
    ok: true,
    applied: result.applied,
    duplicate: result.duplicate,
  });
}

// POST /api/cron/release-expired  (guarded by x-cron-secret)
export async function releaseExpired(req: Request, res: Response): Promise<void> {
  const secret = req.header("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw httpError(403, "errors.cron.forbidden", { code: "FORBIDDEN" });
  }

  const now = new Date();

  // Flip elapsed holds → EXPIRED and their pending payments → EXPIRED.
  const expiredBookings = await prisma.booking.findMany({
    where: {
      status: BookingStatus.PENDING_PAYMENT,
      holdExpiresAt: { lt: now },
    },
    select: { id: true },
  });
  const ids = expiredBookings.map((b) => b.id);

  if (ids.length === 0) {
    res.status(200).json({ ok: true, expired: 0 });
    return;
  }

  await prisma.$transaction([
    prisma.booking.updateMany({
      where: { id: { in: ids } },
      data: { status: BookingStatus.EXPIRED },
    }),
    prisma.payment.updateMany({
      where: {
        bookingId: { in: ids },
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.EXPIRED },
    }),
  ]);

  await audit("cron.release_expired", { meta: { count: ids.length } });

  res.status(200).json({ ok: true, expired: ids.length });
}
