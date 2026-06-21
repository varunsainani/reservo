// Contract test: boots the real backend in-process and verifies the exact
// endpoints + field names the frontend depends on (the reconciliation points).
// Run: npx tsx scripts/contract.ts   (needs Neon; disable sandbox)
import { createApp } from "../src/app";
import "dotenv/config";

const app = createApp();
const PORT = 4071;
const base = `http://localhost:${PORT}`;
let pass = 0;
const fails: string[] = [];
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("  ok  " + m); } else { fails.push(m); console.log("FAIL  " + m); } };

async function req(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Locale": "pt" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const login = async (email: string) => (await req("POST", "/api/auth/login", undefined, { email, password: "demo1234" })).json.accessToken;

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => setTimeout(r, 400));
  try {
    // public providers list -> reconciled field names
    const list = await req("GET", "/api/providers?pageSize=20");
    const card = list.json?.items?.[0];
    ok(list.status === 200 && Array.isArray(list.json?.items), "GET /providers list");
    ok(card && "priceFromCents" in card && "serviceCount" in card && "currency" in card && "slug" in card,
      "provider card has priceFromCents + serviceCount + currency");
    ok(Array.isArray(list.json?.facets?.categories), "providers facets.categories present");

    // provider detail + availability
    const detail = await req("GET", `/api/providers/${card.slug}`);
    const svc = detail.json?.services?.[0];
    ok(detail.status === 200 && Array.isArray(detail.json?.services) && svc?.durationMin > 0, "provider detail + services");
    // find a day with slots (scan next 14 days)
    let slot: any = null;
    for (let i = 1; i <= 14 && !slot; i++) {
      const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
      const av = await req("GET", `/api/providers/${card.slug}/availability?serviceId=${svc.id}&date=${d}`);
      if (av.json?.slots?.length) { slot = av.json.slots[0]; ok(Array.isArray(av.json.slots), `availability ${d}: ${av.json.slots.length} slots`); }
    }
    ok(!!slot, "found a bookable slot within 14 days");

    // full loop: create -> simulate approved -> poll CONFIRMED
    const create = await req("POST", "/api/bookings", undefined, {
      providerSlug: card.slug, serviceId: svc.id, startsAt: slot.startsAt,
      customer: { name: "Contract Test", email: "contract.test@example.com", phone: "+5511999999999" },
    });
    const bk = create.json?.booking, pay = create.json?.payment;
    ok(create.status === 201 && bk?.status === "PENDING_PAYMENT" && bk?.publicToken, "create booking 201 PENDING_PAYMENT + publicToken");
    ok(!!pay?.checkoutUrl && "pixQr" in pay, "payment has checkoutUrl + pixQr");
    const tok = bk.publicToken, id = bk.id;
    // public get by token
    const get1 = await req("GET", `/api/bookings/${id}?token=${tok}`);
    ok(get1.status === 200 && get1.json?.status === "PENDING_PAYMENT", "GET booking by token");
    ok((await req("GET", `/api/bookings/${id}?token=WRONG`)).status === 404, "GET booking wrong token -> 404");
    // simulate approve -> webhook confirm
    const sim = await req("POST", "/api/payments/simulate", undefined, { bookingId: id, token: tok, outcome: "approved" });
    ok(sim.status === 200, "simulate approved 200");
    let confirmed = false;
    for (let i = 0; i < 10 && !confirmed; i++) { const g = await req("GET", `/api/bookings/${id}?token=${tok}`); if (g.json?.status === "CONFIRMED") confirmed = true; else await new Promise(r=>setTimeout(r,300)); }
    ok(confirmed, "booking auto-confirmed after simulated webhook");

    // provider area shapes
    const ptok = await login("provider@reservo.app");
    const mp = await req("GET", "/api/me/provider", ptok);
    ok(mp.status === 200 && Array.isArray(mp.json?.services), "GET /me/provider");
    const av = await req("GET", "/api/me/availability", ptok);
    ok(av.status === 200 && Array.isArray(av.json?.rules), "GET /me/availability -> {rules:[]}");
    const mb = await req("GET", "/api/me/bookings", ptok);
    ok(mb.status === 200 && Array.isArray(mb.json?.items), "GET /me/bookings");
    ok((await req("GET", "/api/me/stats", ptok)).status === 200, "GET /me/stats");

    // admin shapes
    const atok = await login("admin@reservo.app");
    const ov = await req("GET", "/api/admin/overview", atok);
    ok(ov.status === 200 && ov.json?.bookings && typeof ov.json?.revenueCents === "number", "GET /admin/overview");
    const ap = await req("GET", "/api/admin/providers", atok);
    ok(ap.status === 200 && "ownerEmail" in (ap.json?.items?.[0] ?? {}), "admin providers row has ownerEmail");

    // customer bookings path (reconciled)
    const ctok = await login("customer@reservo.app");
    const cb = await req("GET", "/api/me/bookings-customer", ctok);
    ok(cb.status === 200 && Array.isArray(cb.json?.items), "GET /me/bookings-customer (reconciled path)");
  } finally {
    server.close();
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILS:", fails.join("; ")); process.exit(1); }
  console.log("CONTRACT: ALL GREEN"); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
