# Reservo — Booking + LATAM Payment System

Workana portfolio project (built under GitHub user `varunsainani`). Follows the
reusable build pattern in `~/my-projects/PROJECT-PLAYBOOK.md`.

Created: 2026-06. Repo (proposed): `git@github.com:varunsainani/reservo.git`.

## 1. Concept

A generic appointment / reservation booking platform for anything bookable
(clinics, salons, consultants, studios) with real Latin American payment rails.
The headline feature is the full loop shown live: a customer picks a slot, pays
through MercadoPago (Pix or card), and the booking auto-confirms the moment the
payment webhook fires, with no manual step. This directly mirrors the
medical-scheduling + Pix/MercadoPago job posts.

Three roles:
- **Customer** — browses a provider's services, picks a free slot, books, pays.
- **Provider** — defines services + availability, sees their calendar and
  payment status per booking, cancels/reschedules.
- **Admin** — oversees all providers, bookings, and payments.

## 2. Stack (all-Vercel + Neon toolkit)

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind + next-intl.
- **Backend:** Node.js + Express + TypeScript + Prisma.
- **DB:** PostgreSQL on Neon.
- **Payments:** behind a `PaymentProvider` interface. **The live demo runs the
  built-in Simulated provider** (a self-hosted Pix/card checkout that drives the
  identical webhook -> confirm pipeline, no external account). The full
  MercadoPago (Checkout Pro / Pix + card) provider is also implemented and
  selectable via `PAYMENT_PROVIDER=mercadopago` + creds, but is OFF by default.
  Decision (2026-06): Simulated-only for the demo.
- **Confirmations:** in-app confirmation record always; optional real email
  (Brevo single-sender or Gmail SMTP app-password) when creds are provided; a
  WhatsApp deep-link (`wa.me`) as the lightweight messaging option (no Baileys
  infra in serverless).
- **Deploy:** Vercel (frontend + backend serverless) + Neon. Single public URL:
  frontend rewrites `/api/*` to the backend; the API client uses a same-origin
  empty BASE. Webhook endpoint is a public backend route.
- **i18n:** EN + PT primary (Pix/MercadoPago is Brazil-first), ES secondary.
  Full key parity; UI **and** API error/validation messages localized via an
  `X-Locale` header with `Accept-Language` fallback.

## 3. Data model (Prisma)

- **User** (role: CUSTOMER | PROVIDER | ADMIN, auth via JWT + refresh rotation).
- **Provider** (profile: name, slug, bio, timezone, location, avatar).
- **Service** (providerId, name, durationMin, priceCents, currency, active).
- **AvailabilityRule** (providerId, weekday, startTime, endTime) — the weekly
  template the provider defines.
- **TimeBlock** (providerId, start, end, reason) — one-off blocked-out times
  (holidays, breaks).
- **Booking** (providerId, serviceId, customerId, startsAt, endsAt, status,
  priceCents, currency, holdExpiresAt, createdAt). Status:
  `PENDING_PAYMENT | CONFIRMED | CANCELLED | EXPIRED | REFUNDED`.
- **Payment** (bookingId, provider: MERCADOPAGO | SIMULATED, externalId,
  method: PIX | CARD, status: PENDING | APPROVED | REJECTED | EXPIRED,
  amountCents, rawWebhook Json, createdAt).
- **WebhookEvent** (provider, externalId, type, payload, processedAt) — idempotency
  ledger so a webhook is never double-applied.
- **RefreshToken**, **AuditLog**.

Slots are computed (AvailabilityRule minus TimeBlock minus existing non-expired
bookings, sliced by service duration), not stored as rows. Generated/derived at
query time per day.

## 4. Payment + webhook flow (the star)

1. Customer selects a free slot and a service, fills contact details, and
   confirms. The backend creates a `Booking` in `PENDING_PAYMENT` with a
   `holdExpiresAt = now + HOLD_MINUTES` (default 15), inside a transaction that
   also enforces the double-booking guard (§6).
2. The backend creates a payment preference via the active `PaymentProvider`:
   - **MercadoPago:** create a Checkout Pro preference / Pix payment, return the
     init point + Pix QR/copy-paste code. Real sandbox if creds present.
   - **Simulated:** return a fake checkout page hosted by our frontend with a
     "Pay now (approve)" / "Reject" button, mimicking the Pix QR UI.
3. Customer pays. The provider (or the simulated checkout) calls our **webhook**
   endpoint `POST /api/webhooks/payments`. The handler:
   - verifies the signature (MercadoPago) / token (simulated),
   - is **idempotent** via `WebhookEvent`,
   - looks up the payment, marks it APPROVED, and transitions the booking to
     `CONFIRMED` (only here, never client-side),
   - fires the confirmation (in-app + optional email + WhatsApp link).
4. The customer's booking page **polls** booking status and flips to
   "Confirmed" in real time when the webhook lands, demonstrating the async loop
   with no manual step. (Polling, since Vercel serverless has no persistent
   sockets; same approach used successfully on a prior project.)

`PaymentProvider` interface: `createCheckout(booking) -> {checkoutUrl, pix?}`,
`verifyWebhook(req) -> event`, `parseStatus(event) -> {externalId, status, method}`.
Swapping MercadoPago in/out is a one-line config (`PAYMENT_PROVIDER` env).

## 5. Feature set

**Provider calendar**
- Define services (name, duration, price).
- Weekly availability template + one-off blocked times.
- Calendar view of upcoming bookings with per-booking payment status.
- Cancel / reschedule (reschedule = release old slot, hold new, keep payment or
  re-charge per policy).

**Customer booking flow**
- Public provider page → pick service → pick day → see free slots → enter
  details → checkout (Pix or card) → live-confirming booking page → receipt.

**Admin dashboard**
- All providers, all bookings, payment status per booking, revenue overview,
  manual cancel/refund (refund = mark REFUNDED + audit), platform stats.

**Automated confirmation**
- On webhook approval: in-app confirmation + booking receipt page; optional
  email; a prefilled WhatsApp message link to the provider.

## 6. Edge cases (called out explicitly)

- **Double-booking prevention:** a partial unique index on
  `(providerId, startsAt)` for bookings in `(PENDING_PAYMENT, CONFIRMED)`, plus a
  transactional create. A race loses cleanly with a localized 409, never a double
  booking.
- **Unpaid-booking timeout (slot release):** primarily **lazy expiry** —
  availability and booking reads treat `PENDING_PAYMENT` bookings past
  `holdExpiresAt` as `EXPIRED`, freeing the slot with no background worker
  (serverless-friendly). Backed by an optional **Vercel Cron** route
  (`/api/cron/release-expired`) that sweeps and persists expirations.
- **Payment failure / rejection:** webhook marks payment REJECTED, booking stays
  bookable (slot released), customer sees a clear retry path.
- **Webhook replay / duplicates:** idempotency ledger (`WebhookEvent`).
- **Timezone correctness:** provider timezone stored; slot math in UTC, displayed
  in the provider's zone; locale-aware date/time formatting.

## 7. Non-negotiables (every project)

- Fully working EN/PT/ES (UI + backend messages), auto-detect + visible toggle.
- Genuinely full-stack: every page fetches live data; real one-click demo
  accounts (customer/provider/admin); CRUD persists; no dead buttons.
- Rich seed data: a few providers with services, availability, and a mix of
  confirmed/pending/expired bookings so the calendars and dashboards look alive.
- Light/dark themes + mobile-first responsive.

## 8. Live demo script (what sells it)

Open a provider page → book a slot → land on the checkout → pay in the
MercadoPago sandbox (or "Simulate payment") → watch the booking page flip from
"Waiting for payment" to "Confirmed" automatically as the webhook fires → see it
appear confirmed in the provider calendar and admin dashboard.

## 9. Build phases

1. Scaffold monorepo + Prisma schema + Neon + i18n catalogs.
2. Backend: auth, providers/services/availability, slot engine, booking +
   hold/double-booking guard, `PaymentProvider` (MercadoPago + Simulated),
   webhook handler + idempotency, confirmations, admin, seed.
3. Frontend: public provider/booking flow, checkout + live-confirm page,
   provider calendar/dashboard, admin, auth with demo buttons.
4. Integrate + verify locally (in-process smoke incl. the full pay→webhook→confirm
   loop and the expiry/double-booking guards).
5. Deploy all-Vercel + Neon; persist env; webhook URL configured.
6. Final multi-perspective audit (security/i18n/functional/payment-correctness/
   adversarial) → fix → re-verify live.
7. PT/EN screenshots (light+dark, 16:9) + Workana listing copy.

## 10. What I need from you to start

- Create the GitHub repo (proposed `varunsainani/reservo`) and paste the remote.
- A Neon connection string (its own project/DB).
- Payment mode: **Simulated-only** (decided). No payment credentials needed; the
  MercadoPago code ships but stays off.
- Then say **start**.
