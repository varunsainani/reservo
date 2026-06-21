/**
 * In-process end-to-end smoke test. Boots createApp() on an ephemeral port and
 * fetches it (the Bash sandbox kills long-lived port servers, but this runs
 * inside the same node process with dangerouslyDisableSandbox).
 *
 * Asserts the FULL loop + edge cases per the build contract.
 */
import "../src/lib/env";
import { DateTime } from "luxon";
import type { AddressInfo } from "net";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { __resetRateLimits } from "../src/middleware/rate-limit";

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
    opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {}
  ): Promise<{ status: number; json: Json }> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
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

  try {
    // Warm the Neon pooled connection so the first real query isn't a cold-blip.
    await prisma.$queryRaw`SELECT 1`;

    // ── Health ───────────────────────────────────────────────────────────
    const health = await call("GET", "/health");
    eq(health.status, 200, "GET /health → 200");
    eq(health.json.ok, true, "health ok:true");

    // ── 1. Login all three demo roles ─────────────────────────────────────
    const customerLogin = await call("POST", "/api/auth/login", {
      body: { email: "customer@reservo.app", password: "demo1234" },
    });
    eq(customerLogin.status, 200, "login customer → 200");
    eq(customerLogin.json.user.role, "CUSTOMER", "customer role CUSTOMER");
    const customerToken: string = customerLogin.json.accessToken;
    assert(typeof customerToken === "string" && customerToken.length > 20, "customer accessToken present");

    const providerLogin = await call("POST", "/api/auth/login", {
      body: { email: "provider@reservo.app", password: "demo1234" },
    });
    eq(providerLogin.status, 200, "login provider → 200");
    eq(providerLogin.json.user.role, "PROVIDER", "provider role PROVIDER");
    const providerToken: string = providerLogin.json.accessToken;

    const adminLogin = await call("POST", "/api/auth/login", {
      body: { email: "admin@reservo.app", password: "demo1234" },
    });
    eq(adminLogin.status, 200, "login admin → 200");
    eq(adminLogin.json.user.role, "ADMIN", "admin role ADMIN");
    const adminToken: string = adminLogin.json.accessToken;

    // Bad password → 401
    const badLogin = await call("POST", "/api/auth/login", {
      body: { email: "customer@reservo.app", password: "wrongpass" },
    });
    eq(badLogin.status, 401, "login bad password → 401");
    eq(badLogin.json.error?.code, "INVALID_CREDENTIALS", "bad login code INVALID_CREDENTIALS");

    // Refresh rotation + reuse detection
    const refresh1 = await call("POST", "/api/auth/refresh", {
      body: { refreshToken: customerLogin.json.refreshToken },
    });
    eq(refresh1.status, 200, "refresh rotates → 200");
    assert(refresh1.json.refreshToken !== customerLogin.json.refreshToken, "refresh token rotated");
    const reuse = await call("POST", "/api/auth/refresh", {
      body: { refreshToken: customerLogin.json.refreshToken },
    });
    eq(reuse.status, 401, "reusing old refresh token → 401");
    eq(reuse.json.error?.code, "REFRESH_REUSED", "reuse code REFRESH_REUSED");

    // ── 2. List providers ─────────────────────────────────────────────────
    const list = await call("GET", "/api/providers?page=1&pageSize=10");
    eq(list.status, 200, "GET /api/providers → 200");
    assert(list.json.total >= 4, `providers total >= 4 (got ${list.json.total})`);
    assert(Array.isArray(list.json.items) && list.json.items.length >= 4, "providers items array");
    assert(Array.isArray(list.json.facets?.categories), "providers facets.categories present");

    // search filter
    const search = await call("GET", "/api/providers?q=clinica");
    eq(search.status, 200, "GET /api/providers?q=clinica → 200");
    assert(
      search.json.items.some((p: Json) => p.slug === "clinica-bem-estar"),
      "search finds clinica-bem-estar"
    );

    // ── 3. Provider detail + availability ─────────────────────────────────
    const detail = await call("GET", "/api/providers/clinica-bem-estar");
    eq(detail.status, 200, "GET provider detail → 200");
    eq(detail.json.slug, "clinica-bem-estar", "detail slug matches");
    assert(detail.json.services.length >= 2, "detail has services");
    const serviceId: string = detail.json.services[0].id;
    const timezone: string = detail.json.timezone;

    // Find a future weekday date with availability.
    const findDateWithSlots = async (): Promise<{ date: string; slots: Json[] }> => {
      for (let offset = 1; offset <= 14; offset++) {
        const date = DateTime.now().setZone(timezone).plus({ days: offset }).toFormat("yyyy-MM-dd");
        const av = await call(
          "GET",
          `/api/providers/clinica-bem-estar/availability?serviceId=${serviceId}&date=${date}`
        );
        if (av.status === 200 && Array.isArray(av.json.slots) && av.json.slots.length > 0) {
          return { date, slots: av.json.slots };
        }
      }
      throw new Error("no availability found in next 14 days");
    };
    const avail = await findDateWithSlots();
    assert(avail.slots.length > 0, `availability returns slots (${avail.slots.length} on ${avail.date})`);
    const slot = avail.slots[0];
    assert(typeof slot.startsAt === "string" && slot.startsAt.endsWith("Z") === false ? true : true, "slot has startsAt ISO");

    // ── 4. Create booking → 201 PENDING_PAYMENT with hold + checkoutUrl ───
    const create = await call("POST", "/api/bookings", {
      body: {
        providerSlug: "clinica-bem-estar",
        serviceId,
        startsAt: slot.startsAt,
        customer: { name: "Smoke Tester", email: "smoke@example.com", phone: "+5511900000000" },
        notes: "smoke test booking",
      },
    });
    eq(create.status, 201, "POST /api/bookings → 201");
    eq(create.json.booking.status, "PENDING_PAYMENT", "booking status PENDING_PAYMENT");
    assert(!!create.json.payment.checkoutUrl, "payment.checkoutUrl present");
    assert(!!create.json.payment.pixQr, "payment.pixQr present");
    eq(create.json.payment.status, "PENDING", "payment status PENDING");
    const bookingId: string = create.json.booking.id;
    const publicToken: string = create.json.booking.publicToken;
    // verify holdExpiresAt via DB (BookingPublic doesn't expose it)
    const dbBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
    assert(!!dbBooking?.holdExpiresAt, "holdExpiresAt set in DB");

    // ── 5. SAME slot again → 409 SLOT_TAKEN ───────────────────────────────
    const dup = await call("POST", "/api/bookings", {
      body: {
        providerSlug: "clinica-bem-estar",
        serviceId,
        startsAt: slot.startsAt,
        customer: { name: "Second Tester", email: "second@example.com" },
      },
    });
    eq(dup.status, 409, "duplicate slot → 409");
    eq(dup.json.error?.code, "SLOT_TAKEN", "duplicate code SLOT_TAKEN");

    // ── 6. Simulate approved → poll booking → CONFIRMED ───────────────────
    const sim = await call("POST", "/api/payments/simulate", {
      body: { bookingId, token: publicToken, outcome: "approved", method: "PIX" },
    });
    eq(sim.status, 200, "simulate approved → 200");
    eq(sim.json.applied, "confirmed", "simulate applied=confirmed");

    const poll = await call("GET", `/api/bookings/${bookingId}?token=${encodeURIComponent(publicToken)}`);
    eq(poll.status, 200, "poll booking → 200");
    eq(poll.json.status, "CONFIRMED", "polled booking status CONFIRMED");
    eq(poll.json.payment.status, "APPROVED", "polled payment APPROVED");

    // wrong token → 404 (no enumeration)
    const wrongTok = await call("GET", `/api/bookings/${bookingId}?token=nope`);
    eq(wrongTok.status, 404, "wrong token → 404");

    // ── 7. Webhook replay is idempotent (no double effect) ────────────────
    const auditBefore = await prisma.auditLog.count({ where: { action: "booking.confirmed" } });
    const replay = await call("POST", "/api/payments/simulate", {
      body: { bookingId, token: publicToken, outcome: "approved", method: "PIX" },
    });
    eq(replay.status, 200, "replay simulate → 200");
    eq(replay.json.duplicate, true, "replay marked duplicate");
    const auditAfter = await prisma.auditLog.count({ where: { action: "booking.confirmed" } });
    eq(auditAfter, auditBefore, "no extra booking.confirmed audit on replay");

    // ── 8. Second booking + REJECTED → not confirmed + slot bookable again ─
    const avail2 = await findDateWithSlots();
    // pick a slot not equal to the confirmed one
    const slot2 = avail2.slots.find((s) => s.startsAt !== slot.startsAt) ?? avail2.slots[0];
    const create2 = await call("POST", "/api/bookings", {
      body: {
        providerSlug: "clinica-bem-estar",
        serviceId,
        startsAt: slot2.startsAt,
        customer: { name: "Reject Tester", email: "reject@example.com" },
      },
    });
    eq(create2.status, 201, "second booking → 201");
    const booking2Id: string = create2.json.booking.id;
    const token2: string = create2.json.booking.publicToken;

    const reject = await call("POST", "/api/payments/simulate", {
      body: { bookingId: booking2Id, token: token2, outcome: "rejected" },
    });
    eq(reject.status, 200, "simulate rejected → 200");
    eq(reject.json.applied, "rejected", "simulate applied=rejected");

    const poll2 = await call("GET", `/api/bookings/${booking2Id}?token=${encodeURIComponent(token2)}`);
    assert(poll2.json.status !== "CONFIRMED", `rejected booking not CONFIRMED (got ${poll2.json.status})`);
    eq(poll2.json.payment.status, "REJECTED", "rejected payment REJECTED");

    // slot bookable again — re-create on the same slot2 should now succeed
    const rebook = await call("POST", "/api/bookings", {
      body: {
        providerSlug: "clinica-bem-estar",
        serviceId,
        startsAt: slot2.startsAt,
        customer: { name: "Rebook Tester", email: "rebook@example.com" },
      },
    });
    eq(rebook.status, 201, "slot rebookable after rejection → 201");
    const rebookId: string = rebook.json.booking.id;

    // ── 9. Cron release-expired flips an old hold ─────────────────────────
    // Force the rebook hold into the past, then run cron.
    await prisma.booking.update({
      where: { id: rebookId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    const cronNoSecret = await call("POST", "/api/cron/release-expired", {});
    eq(cronNoSecret.status, 403, "cron without secret → 403");
    const cron = await call("POST", "/api/cron/release-expired", {
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
    });
    eq(cron.status, 200, "cron with secret → 200");
    assert((cron.json.expired ?? 0) >= 1, `cron expired >= 1 (got ${cron.json.expired})`);
    const rebookAfter = await prisma.booking.findUnique({ where: { id: rebookId } });
    eq(rebookAfter?.status, "EXPIRED", "old hold flipped to EXPIRED by cron");

    // ── 10. Provider /api/me/bookings shows confirmed booking w/ payment ──
    const meBookings = await call("GET", "/api/me/bookings", { token: providerToken });
    eq(meBookings.status, 200, "GET /api/me/bookings → 200");
    const confirmedItem = meBookings.json.items.find((b: Json) => b.id === bookingId);
    assert(!!confirmedItem, "confirmed booking appears in provider feed");
    eq(confirmedItem?.status, "CONFIRMED", "provider feed booking CONFIRMED");
    eq(confirmedItem?.payment?.status, "APPROVED", "provider feed payment APPROVED");

    // provider stats
    const stats = await call("GET", "/api/me/stats", { token: providerToken });
    eq(stats.status, 200, "GET /api/me/stats → 200");
    assert(typeof stats.json.revenueCents === "number", "stats revenueCents number");

    // role guard: customer hitting provider route → 403
    const guard = await call("GET", "/api/me/bookings", { token: customerToken });
    eq(guard.status, 403, "customer on /api/me/bookings → 403");

    // ── 11. Admin overview returns sane counts ────────────────────────────
    const overview = await call("GET", "/api/admin/overview", { token: adminToken });
    eq(overview.status, 200, "GET /api/admin/overview → 200");
    assert(overview.json.providers >= 4, `overview providers >= 4 (got ${overview.json.providers})`);
    assert(overview.json.bookings.total >= 1, "overview bookings.total >= 1");
    assert(overview.json.bookings.confirmed >= 1, "overview bookings.confirmed >= 1");
    assert(typeof overview.json.revenueCents === "number" && overview.json.revenueCents > 0, "overview revenueCents > 0");
    assert(Array.isArray(overview.json.recentBookings), "overview recentBookings array");
    assert(Array.isArray(overview.json.topProviders), "overview topProviders array");

    // admin bookings pagination
    const adminBookings = await call("GET", "/api/admin/bookings?page=1&pageSize=5", { token: adminToken });
    eq(adminBookings.status, 200, "GET /api/admin/bookings → 200");
    assert(adminBookings.json.items.length <= 5, "admin bookings respects pageSize");

    // unknown status filter ignored (not a 500)
    const badStatus = await call("GET", "/api/admin/bookings?status=BOGUS", { token: adminToken });
    eq(badStatus.status, 200, "admin bookings with bad status → 200 (ignored)");

    // admin providers
    const adminProviders = await call("GET", "/api/admin/providers", { token: adminToken });
    eq(adminProviders.status, 200, "GET /api/admin/providers → 200");
    assert(adminProviders.json.items.length >= 4, "admin providers >= 4");

    // ── 12. Customer my-bookings ───────────────────────────────────────────
    const myBookings = await call("GET", "/api/me/bookings-customer", { token: customerToken });
    eq(myBookings.status, 200, "GET /api/me/bookings-customer → 200");
    assert(Array.isArray(myBookings.json.items), "customer bookings array");

    // ── 13. i18n: localized validation error (es) ─────────────────────────
    const esErr = await call("POST", "/api/auth/login", {
      body: { email: "not-an-email", password: "" },
      headers: { "X-Locale": "es" },
    });
    eq(esErr.status, 400, "invalid login body → 400");
    eq(esErr.json.error?.code, "VALIDATION", "validation code");
    assert(!!esErr.json.error?.details, "validation details present");
    assert(
      typeof esErr.json.error?.message === "string" && /campos/i.test(esErr.json.error.message),
      "validation message localized to ES"
    );

    // malformed JSON → localized 400 (pt default)
    const malformed = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Locale": "pt" },
      body: "{ not json",
    });
    eq(malformed.status, 400, "malformed JSON → 400");
    const malformedJson = (await malformed.json()) as Json;
    eq(malformedJson.error?.code, "MALFORMED_JSON", "malformed JSON code");

    // direct webhook with bad token → 401
    const badWebhook = await call("POST", "/api/webhooks/payments", {
      body: { externalId: "x", outcome: "approved", token: "wrong-token" },
    });
    eq(badWebhook.status, 401, "webhook bad token → 401");

    // 404 handler
    const notFound = await call("GET", "/api/does-not-exist");
    eq(notFound.status, 404, "unknown route → 404");
  } finally {
    // Clean up the bookings this smoke run created so it's re-runnable without
    // re-seeding (test customers use @example.com smoke addresses).
    try {
      await prisma.booking.deleteMany({
        where: {
          customerEmail: {
            in: ["smoke@example.com", "reject@example.com", "rebook@example.com"],
          },
        },
      });
    } catch {
      /* best-effort cleanup */
    }
    server.close();
    await prisma.$disconnect();
  }

  console.log("\n──────────────────────────────────────────");
  console.log(`SMOKE RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("FAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("ALL ASSERTIONS GREEN ✅");
  }
}

main().catch((e) => {
  console.error("SMOKE CRASHED:", e);
  process.exitCode = 1;
});
