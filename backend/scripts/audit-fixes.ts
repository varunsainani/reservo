/**
 * In-process audit-fix verification. Boots createApp() on an ephemeral port and
 * fetches it in the same node process (the Bash sandbox kills long-lived port
 * servers; run with dangerouslyDisableSandbox).
 *
 * Proves the three behavioural fixes:
 *   (a) TASK 92 — a DIFFERENT-duration booking that OVERLAPS an existing
 *       CONFIRMED booking (but starts at a different instant) returns 409
 *       SLOT_TAKEN (the partial unique index alone would miss this).
 *   (b) TASK 94 — reject-then-approve on the SAME booking ends CONFIRMED (the
 *       approval is no longer swallowed as a duplicate webhook event).
 *   (c) TASK 95 — approving an already-EXPIRED hold does NOT confirm and does
 *       NOT mark the payment APPROVED (it settles the payment EXPIRED).
 *
 * All rows created here are tagged with a unique customerEmail marker and torn
 * down in a finally block, so the seed data is left untouched.
 */
import "../src/lib/env";
import { DateTime } from "luxon";
import type { AddressInfo } from "net";
import { BookingStatus, PaymentStatus } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { __resetRateLimits } from "../src/middleware/rate-limit";

const MARKER = `audit-fix-${Date.now()}@example.com`;
const EMAIL_PREFIX = "audit-fix-";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: unknown, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  - ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  FAIL- ${msg}`);
  }
}
function eq(a: unknown, b: unknown, msg: string): void {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

const SLUG = "clinica-bem-estar";

async function main(): Promise<void> {
  __resetRateLimits();
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  type Json = Record<string, any>;
  const call = async (
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<{ status: number; json: Json }> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let json: Json = {};
    try {
      json = (await res.json()) as Json;
    } catch {
      json = {};
    }
    return { status: res.status, json };
  };

  // Track booking ids for verification/cleanup.
  const createdBookingIds: string[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;

    // Resolve the clinic's services by duration (30 + 60 min both on the grid).
    const detail = await call("GET", `/api/providers/${SLUG}`);
    eq(detail.status, 200, "provider detail 200");
    const services: Json[] = detail.json.services;
    const svc60 = services.find((s) => s.durationMin === 60);
    const svc30 = services.find((s) => s.durationMin === 30);
    assert(!!svc60 && !!svc30, "found 60-min and 30-min services on the clinic");
    const timezone: string = detail.json.timezone;

    // Find a future weekday whose 09:00 (local) 60-min slot is free, and whose
    // 09:30 (local) 30-min slot is also offered. 09:00–10:00 (60m) overlaps
    // 09:30–10:00 (30m) but they start at different instants.
    const find0900Day = async (): Promise<{
      start60: string;
      start30: string;
    }> => {
      for (let offset = 1; offset <= 21; offset++) {
        const date = DateTime.now()
          .setZone(timezone)
          .plus({ days: offset })
          .toFormat("yyyy-MM-dd");
        const av60 = await call(
          "GET",
          `/api/providers/${SLUG}/availability?serviceId=${svc60!.id}&date=${date}`
        );
        const av30 = await call(
          "GET",
          `/api/providers/${SLUG}/availability?serviceId=${svc30!.id}&date=${date}`
        );
        if (av60.status !== 200 || av30.status !== 200) continue;
        const want0900 = DateTime.fromISO(`${date}T09:00`, { zone: timezone })
          .toUTC()
          .toISO({ suppressMilliseconds: true });
        const want0930 = DateTime.fromISO(`${date}T09:30`, { zone: timezone })
          .toUTC()
          .toISO({ suppressMilliseconds: true });
        const has60 = (av60.json.slots ?? []).some(
          (s: Json) => s.startsAt === want0900
        );
        const has30 = (av30.json.slots ?? []).some(
          (s: Json) => s.startsAt === want0930
        );
        if (has60 && has30) return { start60: want0900!, start30: want0930! };
      }
      throw new Error("no day with both 09:00(60m) and 09:30(30m) free in 21d");
    };
    const { start60, start30 } = await find0900Day();

    // ── (a) TASK 92: overlap with a different-duration booking → 409 ─────────
    const create60 = await call("POST", "/api/bookings", {
      body: {
        providerSlug: SLUG,
        serviceId: svc60!.id,
        startsAt: start60,
        customer: { name: "Overlap Base", email: MARKER },
      },
    });
    eq(create60.status, 201, "(a) base 60-min booking created → 201");
    const base60Id: string = create60.json.booking.id;
    const base60Token: string = create60.json.booking.publicToken;
    createdBookingIds.push(base60Id);

    // Confirm it so it's an active CONFIRMED occupant.
    const approve60 = await call("POST", "/api/payments/simulate", {
      body: { bookingId: base60Id, token: base60Token, outcome: "approved", method: "PIX" },
    });
    eq(approve60.json.applied, "confirmed", "(a) base booking confirmed");

    // Attempt an OVERLAPPING 30-min booking at 09:30 (different start instant).
    const overlap = await call("POST", "/api/bookings", {
      body: {
        providerSlug: SLUG,
        serviceId: svc30!.id,
        startsAt: start30,
        customer: { name: "Overlap Attempt", email: MARKER },
      },
    });
    if (overlap.status === 201) createdBookingIds.push(overlap.json.booking.id);
    eq(overlap.status, 409, "(a) overlapping different-duration booking → 409");
    eq(overlap.json.error?.code, "SLOT_TAKEN", "(a) overlap code SLOT_TAKEN");

    // ── (b) TASK 94: reject-then-approve ends CONFIRMED ─────────────────────
    // Use a far-future weekday 11:00 slot to avoid colliding with (a).
    const findFreeSlot = async (svcId: string): Promise<string> => {
      for (let offset = 2; offset <= 28; offset++) {
        const date = DateTime.now()
          .setZone(timezone)
          .plus({ days: offset })
          .toFormat("yyyy-MM-dd");
        const av = await call(
          "GET",
          `/api/providers/${SLUG}/availability?serviceId=${svcId}&date=${date}`
        );
        if (av.status === 200 && (av.json.slots ?? []).length > 0) {
          // pick a mid-day slot to reduce collision risk
          const slots: Json[] = av.json.slots;
          return (slots[Math.floor(slots.length / 2)] ?? slots[0]).startsAt;
        }
      }
      throw new Error("no free slot found");
    };
    const rejStart = await findFreeSlot(svc30!.id);
    const createRej = await call("POST", "/api/bookings", {
      body: {
        providerSlug: SLUG,
        serviceId: svc30!.id,
        startsAt: rejStart,
        customer: { name: "Reject Then Pay", email: MARKER },
      },
    });
    eq(createRej.status, 201, "(b) reject-then-pay booking created → 201");
    const rejId: string = createRej.json.booking.id;
    const rejToken: string = createRej.json.booking.publicToken;
    createdBookingIds.push(rejId);

    const doReject = await call("POST", "/api/payments/simulate", {
      body: { bookingId: rejId, token: rejToken, outcome: "rejected" },
    });
    eq(doReject.json.applied, "rejected", "(b) rejection applied");

    // The slot is now free again. Re-book (the hold→EXPIRED freed it), then pay.
    const reBook = await call("POST", "/api/bookings", {
      body: {
        providerSlug: SLUG,
        serviceId: svc30!.id,
        startsAt: rejStart,
        customer: { name: "Reject Then Pay 2", email: MARKER },
      },
    });
    eq(reBook.status, 201, "(b) re-book same slot after rejection → 201");
    const reId: string = reBook.json.booking.id;
    const reToken: string = reBook.json.booking.publicToken;
    createdBookingIds.push(reId);

    // First reject THIS booking, then approve it — the approval must NOT be
    // swallowed by the webhook idempotency ledger.
    const reReject = await call("POST", "/api/payments/simulate", {
      body: { bookingId: reId, token: reToken, outcome: "rejected" },
    });
    eq(reReject.json.applied, "rejected", "(b) same-booking rejection applied");
    // Re-arm the hold so the booking is PENDING_PAYMENT again (the reject set it
    // EXPIRED to free the slot). This models the user retrying payment in-window.
    await prisma.booking.update({
      where: { id: reId },
      data: {
        status: BookingStatus.PENDING_PAYMENT,
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    const reApprove = await call("POST", "/api/payments/simulate", {
      body: { bookingId: reId, token: reToken, outcome: "approved", method: "PIX" },
    });
    eq(reApprove.status, 200, "(b) approve after reject → 200");
    eq(reApprove.json.applied, "confirmed", "(b) approval applied=confirmed (NOT swallowed)");
    eq(reApprove.json.duplicate, false, "(b) approval not a duplicate ledger event");

    const reBooking = await prisma.booking.findUnique({
      where: { id: reId },
      include: { payment: true },
    });
    eq(reBooking?.status, BookingStatus.CONFIRMED, "(b) booking ends CONFIRMED");
    eq(reBooking?.payment?.status, PaymentStatus.APPROVED, "(b) payment ends APPROVED");

    // ── (c) TASK 95: approving an already-EXPIRED hold must not confirm ──────
    const expStart = await findFreeSlot(svc30!.id);
    const createExp = await call("POST", "/api/bookings", {
      body: {
        providerSlug: SLUG,
        serviceId: svc30!.id,
        startsAt: expStart,
        customer: { name: "Expired Hold", email: MARKER },
      },
    });
    eq(createExp.status, 201, "(c) booking created → 201");
    const expId: string = createExp.json.booking.id;
    const expToken: string = createExp.json.booking.publicToken;
    createdBookingIds.push(expId);

    // Force the booking into EXPIRED (the hold elapsed / cron ran).
    await prisma.booking.update({
      where: { id: expId },
      data: {
        status: BookingStatus.EXPIRED,
        holdExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    const lateApprove = await call("POST", "/api/payments/simulate", {
      body: { bookingId: expId, token: expToken, outcome: "approved", method: "PIX" },
    });
    eq(lateApprove.status, 200, "(c) late approve → 200");
    eq(lateApprove.json.applied, "expired", "(c) late approve applied=expired (not confirmed)");

    const expBooking = await prisma.booking.findUnique({
      where: { id: expId },
      include: { payment: true },
    });
    eq(expBooking?.status, BookingStatus.EXPIRED, "(c) booking stays EXPIRED (not confirmed)");
    assert(
      expBooking?.payment?.status !== PaymentStatus.APPROVED,
      `(c) payment NOT marked APPROVED (got ${expBooking?.payment?.status})`
    );
    eq(expBooking?.payment?.status, PaymentStatus.EXPIRED, "(c) payment settled EXPIRED");
  } finally {
    // ── Cleanup: remove every row this script created, leaving the seed data
    //    untouched. Payments + webhook events keyed on those bookings go too.
    const mine = await prisma.booking.findMany({
      where: { customerEmail: { startsWith: EMAIL_PREFIX } },
      select: { id: true, payment: { select: { externalId: true } } },
    });
    const ids = mine.map((b) => b.id);
    const extIds = mine
      .map((b) => b.payment?.externalId)
      .filter((x): x is string => !!x);
    // WebhookEvents are not FK-linked to payments; match by the simulated
    // ledger key prefix (sim_<base>_<outcome>).
    if (extIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: { OR: extIds.map((e) => ({ externalId: { startsWith: e } })) },
      });
    }
    if (ids.length > 0) {
      // Payments cascade on booking delete (onDelete: Cascade).
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
    // Audit logs reference booking ids in their meta JSON. Best-effort delete of
    // the rows this run authored (match each created booking id in meta).
    let auditDeleted = 0;
    for (const id of ids) {
      const r = await prisma.auditLog
        .deleteMany({
          where: {
            action: {
              in: [
                "booking.created",
                "booking.confirmed",
                "payment.failed",
                "payment.approved_after_hold_lost",
              ],
            },
            meta: { path: ["bookingId"], equals: id },
          },
        })
        .catch(() => ({ count: 0 }));
      auditDeleted += r.count;
    }
    console.log(
      `\ncleanup: removed ${ids.length} booking(s) + ${extIds.length} webhook ledger key(s) + ${auditDeleted} audit row(s)`
    );

    await prisma.$disconnect();
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("FAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
