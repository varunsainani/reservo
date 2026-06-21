import {
  BookingStatus,
  PaymentStatus,
  type PaymentMethod,
  type PaymentProviderType,
  Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { sendConfirmation } from "./confirmations";
import { DEFAULT_LOCALE, type Locale } from "../i18n";

export interface ProcessWebhookInput {
  provider: PaymentProviderType;
  /**
   * Idempotency / ledger key written to WebhookEvent (unique per
   * provider+externalId). For the SIMULATED provider this includes the outcome
   * (e.g. `sim_<paymentId>_approved`) so a later approval after a rejection is a
   * DISTINCT ledger row and IS applied, while replaying the same outcome stays a
   * no-op.
   */
  externalId: string;
  /**
   * Key used to locate the target Payment.externalId. Defaults to `externalId`
   * when omitted (MercadoPago, where the two coincide). The SIMULATED provider
   * passes the stable base id here so the outcome-suffixed ledger key never
   * breaks the payment lookup.
   */
  paymentExternalId?: string;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  type: string;
  raw: unknown;
  locale?: Locale;
}

export interface ProcessResult {
  ok: true;
  duplicate: boolean;
  applied: "confirmed" | "rejected" | "expired" | "noop";
}

/**
 * Core webhook processor — shared by POST /api/webhooks/payments and the
 * /api/payments/simulate convenience endpoint. Idempotent via the WebhookEvent
 * unique ledger; confirmation happens ONLY here (never client-side).
 */
export async function processPaymentWebhook(
  input: ProcessWebhookInput
): Promise<ProcessResult> {
  const locale = input.locale ?? DEFAULT_LOCALE;

  // 1) Idempotency: record the event first. A replay collides on the unique
  //    (provider, externalId) and is a no-op.
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: input.provider,
        externalId: input.externalId,
        type: input.type,
        payload: toJson(input.raw),
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: true, duplicate: true, applied: "noop" };
    }
    throw e;
  }

  // 2) Find the payment this event targets. The lookup key may differ from the
  //    ledger key (SIMULATED suffixes the outcome onto the ledger key only).
  const lookupExternalId = input.paymentExternalId ?? input.externalId;
  const payment = await prisma.payment.findFirst({
    where: { provider: input.provider, externalId: lookupExternalId },
    include: { booking: true },
  });

  if (!payment || !payment.booking) {
    // Event recorded (so replays stay no-ops) but nothing to apply.
    return { ok: true, duplicate: false, applied: "noop" };
  }

  // ── APPROVED → confirm in a transaction ──────────────────────────────────
  if (input.status === PaymentStatus.APPROVED) {
    // Already confirmed/settled → no double effect.
    if (
      payment.status === PaymentStatus.APPROVED ||
      payment.booking.status === BookingStatus.CONFIRMED
    ) {
      return { ok: true, duplicate: false, applied: "noop" };
    }
    // Only confirm a booking still awaiting payment.
    if (payment.booking.status !== BookingStatus.PENDING_PAYMENT) {
      // The hold is gone (booking EXPIRED/CANCELLED meanwhile): the slot can't be
      // honoured, so do NOT mark the payment APPROVED (that would inflate revenue
      // aggregates, which sum APPROVED payments) and do NOT confirm. Settle the
      // payment as EXPIRED and leave an audit trail.
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.EXPIRED,
            method: input.method ?? payment.method,
            raw: toJson(input.raw),
          },
        });
        await audit("payment.approved_after_hold_lost", {
          actorId: payment.booking.customerId,
          meta: {
            bookingId: payment.bookingId,
            paymentId: payment.id,
            bookingStatus: payment.booking.status,
          },
          db: tx,
        });
      });
      return { ok: true, duplicate: false, applied: "expired" };
    }

    const confirmed = await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.APPROVED,
          method: input.method ?? payment.method,
          raw: toJson(input.raw),
        },
      });
      const b = await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: BookingStatus.CONFIRMED, holdExpiresAt: null },
        include: {
          provider: true,
          service: true,
        },
      });
      await audit("booking.confirmed", {
        actorId: b.customerId,
        meta: { bookingId: b.id, paymentId: payment.id },
        db: tx,
      });
      return b;
    });

    // Fire confirmation side-effects (in-app record is the booking itself).
    await sendConfirmation({
      booking: confirmed,
      provider: confirmed.provider,
      service: confirmed.service,
      locale,
    });

    return { ok: true, duplicate: false, applied: "confirmed" };
  }

  // ── REJECTED / EXPIRED → mark payment, leave booking bookable ────────────
  if (
    input.status === PaymentStatus.REJECTED ||
    input.status === PaymentStatus.EXPIRED
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: input.status,
          method: input.method ?? payment.method,
          raw: toJson(input.raw),
        },
      });
      // Free the slot: a still-pending booking becomes EXPIRED so the slot
      // leaves the active-unique guard and is bookable again.
      if (payment.booking.status === BookingStatus.PENDING_PAYMENT) {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: BookingStatus.EXPIRED, holdExpiresAt: new Date() },
        });
      }
      await audit("payment.failed", {
        meta: {
          bookingId: payment.bookingId,
          paymentId: payment.id,
          status: input.status,
        },
        db: tx,
      });
    });

    return {
      ok: true,
      duplicate: false,
      applied: input.status === PaymentStatus.REJECTED ? "rejected" : "expired",
    };
  }

  // ── Other statuses (PENDING/REFUNDED via webhook) → just record ──────────
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: input.status,
      method: input.method ?? payment.method,
      raw: toJson(input.raw),
    },
  });
  return { ok: true, duplicate: false, applied: "noop" };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  // Ensure the raw payload is JSON-serializable for Prisma's Json column.
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
