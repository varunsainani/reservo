# Reservo — Build Contract (SPEC)

Source of truth for the backend and frontend builds. Both sides MUST match the
shapes, paths, status codes, enums, and i18n keys here. See `PLAN.md` for intent.

## 0. Conventions

- Money: integer **cents** (`priceCents`), plus `currency` (`BRL` default, `ARS`,
  `MXN`, `USD`). Format per locale on the client.
- Time: all timestamps are ISO-8601 UTC. Each provider has a `timezone` (IANA,
  e.g. `America/Sao_Paulo`); slot math is done in UTC, displayed in that zone.
- IDs: cuid strings.
- Locale: every request may send `X-Locale: en|pt|es` (default by
  `Accept-Language`, fallback `pt`). Backend localizes all `error.message` and
  confirmation text. Frontend sends `X-Locale` from the `NEXT_LOCALE` cookie.
- Error shape (always): `{ "error": { "message": string, "code"?: string, "details"?: Record<string,string> } }`.
- Success shapes are documented per endpoint. Lists: `{ items: [...], total, page, pageSize }`.
- Single public URL: frontend rewrites `/api/*` and `/health` to the backend
  (`API_PROXY_TARGET`). API client BASE is empty (same-origin `/api`).

## 1. Roles & Auth

Roles: `CUSTOMER`, `PROVIDER`, `ADMIN`. JWT access token (`ACCESS_TOKEN_TTL`,
default `30m`) + opaque rotating refresh token (SHA-256 hashed at rest, reuse
detection revokes the family). `Authorization: Bearer <access>`.

- `POST /api/auth/register` `{ email, password(min8), name, role: "CUSTOMER"|"PROVIDER" }` → 201 `{ user, accessToken, refreshToken }`. Cannot register ADMIN. Registering a PROVIDER also creates an empty `Provider` row owned by them.
- `POST /api/auth/login` `{ email, password }` → 200 `{ user, accessToken, refreshToken }`.
- `POST /api/auth/refresh` `{ refreshToken }` → 200 `{ accessToken, refreshToken }`.
- `POST /api/auth/logout` `{ refreshToken }` → 200 `{ ok: true }`.
- `GET /api/auth/me` (auth) → 200 `{ user }`.

`user` = `{ id, email, name, role }`.

Demo accounts (seed), password `demo1234`: `customer@reservo.app`,
`provider@reservo.app` (owns the "Clínica Bem-Estar" provider),
`admin@reservo.app`. Exposed to the frontend as `NEXT_PUBLIC_DEMO_*`.

## 2. Data model (Prisma)

```
User        id, email@unique, passwordHash, name, role(Role), createdAt
Provider    id, userId@unique, slug@unique, name, bio, category(string),
            timezone, city, region, country(default ""), avatarUrl?, createdAt
Service     id, providerId, name, description?, durationMin(Int), priceCents(Int),
            currency(default "BRL"), active(default true), sortOrder(Int default 0)
AvailabilityRule id, providerId, weekday(0-6, 0=Sun), startMinute(Int), endMinute(Int)
            // minutes from local midnight; e.g. 540=09:00, 1020=17:00
TimeBlock   id, providerId, startsAt(DateTime), endsAt(DateTime), reason?
Booking     id, providerId, serviceId, customerId?(User), customerName,
            customerEmail, customerPhone?, startsAt, endsAt, status(BookingStatus),
            priceCents, currency, holdExpiresAt(DateTime?), publicToken(unique),
            notes?, createdAt, updatedAt
Payment     id, bookingId@unique, provider(PaymentProviderType), method(PaymentMethod?),
            externalId?, status(PaymentStatus), amountCents, currency,
            checkoutUrl?, pixQr?, raw(Json?), createdAt, updatedAt
WebhookEvent id, provider(PaymentProviderType), externalId, type, payload(Json),
            processedAt(DateTime)  @@unique([provider, externalId])
RefreshToken id, userId, tokenHash@unique, family, revokedAt?, expiresAt, createdAt
AuditLog    id, actorId?(User SetNull), action, meta(Json?), createdAt

enum Role { CUSTOMER PROVIDER ADMIN }
enum BookingStatus { PENDING_PAYMENT CONFIRMED CANCELLED EXPIRED REFUNDED }
enum PaymentProviderType { SIMULATED MERCADOPAGO }
enum PaymentMethod { PIX CARD }
enum PaymentStatus { PENDING APPROVED REJECTED EXPIRED REFUNDED }
```

Indexes: `Provider(slug)`, `Service(providerId)`, `AvailabilityRule(providerId)`,
`TimeBlock(providerId, startsAt)`, `Booking(providerId, startsAt)`,
`Booking(status)`, `Booking(customerEmail)`, `Booking(publicToken)`.

**Double-booking guard:** a partial unique index so two active bookings can't
share a provider+slot. Add via raw SQL in `prisma/constraints.sql`
(applied after `db push`, like Localia's fts.sql pattern):
`CREATE UNIQUE INDEX IF NOT EXISTS booking_active_slot_uq ON "Booking" ("providerId","startsAt") WHERE status IN ('PENDING_PAYMENT','CONFIRMED');`

## 3. Slot engine

`computeSlots(provider, service, dateYYYYMMDD)`:
1. For the given local date + provider timezone, take all `AvailabilityRule`
   rows for that weekday → candidate windows [startMinute, endMinute).
2. Slice each window into `service.durationMin` steps (step = durationMin).
3. Drop a slot if it overlaps a `TimeBlock` or an existing active Booking
   (`PENDING_PAYMENT` not past hold, or `CONFIRMED`) for that provider.
4. Drop slots already started (now + small lead, e.g. ≥ 1h ahead) for "today".
5. Return `{ slots: [{ startsAt, endsAt }] }` in UTC ISO.

A `PENDING_PAYMENT` booking past `holdExpiresAt` is treated as free (lazy expiry)
and its slot is bookable again.

## 4. Public booking + payment

- `GET /api/providers?q&category&page&pageSize` → `{ items: ProviderCard[], total, page, pageSize, facets:{categories:[{value,count}]} }`.
- `GET /api/providers/:slug` → `ProviderDetail` (profile + active services).
- `GET /api/providers/:slug/availability?serviceId&date=YYYY-MM-DD` → `{ date, slots:[{startsAt,endsAt}] }`.
- `POST /api/bookings` (no auth required; if Bearer present and role CUSTOMER, link `customerId`)
  body `{ providerSlug, serviceId, startsAt, customer:{ name, email, phone? }, notes? }`
  → 201 `{ booking: BookingPublic, payment:{ id, status, method?, checkoutUrl, pixQr? } }`.
  Creates `Booking(PENDING_PAYMENT, holdExpiresAt=now+HOLD_MINUTES)` + `Payment(PENDING)`
  in ONE transaction; double-booked slot → 409 `code:"SLOT_TAKEN"`; past/invalid slot → 400.
  For SIMULATED provider, `checkoutUrl = ${APP_URL}/checkout/${booking.id}?token=${publicToken}`
  and `pixQr` is a mock data string.
- `GET /api/bookings/:id?token=publicToken` → `BookingPublic` (used by the live-confirm poll).
  Wrong/absent token → 404 (no enumeration).

`BookingPublic` = `{ id, status, startsAt, endsAt, priceCents, currency, publicToken, service:{name,durationMin}, provider:{name,slug,timezone,whatsapp?}, payment:{status,method?}, customerName }`.

## 5. Payments + webhook (the star)

`PaymentProvider` interface (backend `src/payments/`):
`createCheckout(booking, payment) → { checkoutUrl, pixQr?, externalId }`,
`verifyWebhook(req) → { externalId, status: PaymentStatus, method?: PaymentMethod, type, raw }`.
Active provider chosen by `PAYMENT_PROVIDER` env (`simulated` default; `mercadopago` implemented but off).

**Simulated provider:** checkout is a frontend page; "paying" posts to the real
webhook so the loop is honest.
- `POST /api/payments/simulate` `{ bookingId, token(publicToken), outcome: "approved"|"rejected" }`
  → server-side calls the same webhook-processing function with a SIMULATED event
  (signed with `SIMULATED_WEBHOOK_TOKEN`). → 200 `{ ok: true }`.
  (Equivalently the page may POST `/api/webhooks/payments` directly with the token;
  expose `/api/payments/simulate` as the clean client-facing entry.)

**Webhook:** `POST /api/webhooks/payments`
- MercadoPago: verify signature, fetch payment, map status.
- Simulated: validate `x-simulated-token` / body token == `SIMULATED_WEBHOOK_TOKEN`.
- Idempotent via `WebhookEvent @@unique([provider, externalId])` (replay → 200 no-op).
- On `APPROVED`: in a transaction set `Payment.APPROVED` + `Booking.CONFIRMED`,
  write AuditLog, fire confirmation (§6). On `REJECTED`/`EXPIRED`: set payment
  status, leave booking bookable (it lazy-expires), so the slot frees.
- Always 200 to the caller unless the signature/token is invalid (401).

**Booking state machine:** `PENDING_PAYMENT` → (webhook approved) `CONFIRMED`;
→ (rejected / hold elapsed) `EXPIRED`; provider/admin → `CANCELLED`; admin refund
on a confirmed booking → `REFUNDED`. Confirmation happens ONLY in the webhook path.

**Expiry / slot release:** lazy (reads treat expired holds as free) + a cron route
`POST /api/cron/release-expired` (guarded by `x-cron-secret == CRON_SECRET`) that
flips elapsed `PENDING_PAYMENT` → `EXPIRED` and their payments → `EXPIRED`.
Configure as a Vercel Cron (every few minutes) on deploy.

## 6. Confirmations

On confirmation: always create the in-app record (the booking is now CONFIRMED and
shows on the receipt page + dashboards) and an `AuditLog`. Build a `wa.me` deep
link `https://wa.me/<providerPhone>?text=<localized confirmation>` surfaced on the
receipt. Email is optional: if `SMTP_*`/`BREVO_*` set, send a localized receipt;
otherwise skip silently (no crash). No Baileys/socket infra.

## 7. Provider area (`/api/me/*`, role PROVIDER)

- `GET /api/me/provider` → my `ProviderDetail` incl. services, availability rules, blocks.
- `PUT /api/me/provider` `{ name, slug?, bio, category, timezone, city, region, country, whatsapp?, avatarUrl? }` → updated provider.
- `GET/POST /api/me/services`, `PUT/DELETE /api/me/services/:id` (`{ name, description?, durationMin, priceCents, currency, active, sortOrder }`).
- `GET /api/me/availability` → `{ rules:[{weekday,startMinute,endMinute}] }`; `PUT /api/me/availability` `{ rules:[...] }` (replace-all).
- `GET/POST /api/me/blocks`, `DELETE /api/me/blocks/:id` (`{ startsAt, endsAt, reason? }`).
- `GET /api/me/bookings?from&to&status` → `{ items: BookingAdmin[] }` (calendar feed, includes payment status).
- `PATCH /api/me/bookings/:id` `{ action: "cancel" }` or `{ action: "reschedule", startsAt }` (reschedule re-runs the slot guard; keeps the existing payment).
- `GET /api/me/stats` → `{ upcoming, confirmedThisMonth, revenueCents, pendingCount }`.

`BookingAdmin` = BookingPublic minus token, plus `{ customerEmail, customerPhone, createdAt, payment:{status,method,amountCents} }`.

## 8. Admin (`/api/admin/*`, role ADMIN)

- `GET /api/admin/overview` → `{ providers, bookings:{ total, confirmed, pending, cancelled, expired }, revenueCents, recentBookings: BookingAdmin[], topProviders:[...] }`.
- `GET /api/admin/bookings?status&providerId&page&pageSize` → paginated `BookingAdmin`.
- `PATCH /api/admin/bookings/:id` `{ action: "cancel" | "refund" }`.
- `GET /api/admin/providers?page&pageSize` → paginated provider rows + counts.

## 9. i18n

Frontend `src/i18n/messages/{en,pt,es}.json` (full parity). Backend
`src/i18n/{en,pt,es}.ts` for `errors.*` (common/auth/booking/payment/provider) +
`confirmation.*`. Default locale `pt`. Numbers/currency/date via `Intl` per locale.

## 10. Seed (`backend/prisma/seed.ts`)

- Demo users (customer/provider/admin, `demo1234`).
- 4 providers across categories (health/clinic, salon/beauty, consulting,
  fitness/studio), each: 2-3 services (varied duration/price), a weekly
  availability template (e.g. Mon-Fri 09:00-17:00 + some Sat), 1-2 time blocks.
  `provider@reservo.app` owns the first (e.g. "Clínica Bem-Estar", BRL).
- Bookings spread across the next ~14 days: several CONFIRMED (with APPROVED
  payments, Pix & card), a couple PENDING_PAYMENT (fresh holds), one EXPIRED, one
  CANCELLED, so calendars/dashboards/admin look alive. Idempotent (clear + reseed).

## 11. Frontend routes

- `/` landing: value prop + provider browse/search.
- `/p/[slug]` provider page: services, then a booking widget (pick service → day
  picker → free slots → contact details → "Continue to payment").
- `/checkout/[id]?token=` simulated checkout: Pix QR mock + amount, "Pay now" and
  "Simulate rejection"; on pay calls `/api/payments/simulate` then routes to the booking page.
- `/booking/[id]?token=` live-confirming status page: polls `GET /api/bookings/:id`
  every ~2s; "Waiting for payment" → "Confirmed" receipt with wa.me link + details.
- `/login`, `/register` (demo buttons for the 3 roles).
- `/my-bookings` (logged-in customer: their bookings by email/userId).
- `/dashboard` provider overview/stats; `/dashboard/calendar`; `/dashboard/services`;
  `/dashboard/availability` (weekly template + blocks).
- `/admin`, `/admin/bookings`, `/admin/providers`.
- Navbar role-aware; language toggle + theme toggle on public/auth and in-app.
  Light/dark + mobile-first. NO dead buttons.

## 12. Env

Backend: `DATABASE_URL`(pooled), `DIRECT_URL`(direct), `JWT_ACCESS_SECRET`,
`ACCESS_TOKEN_TTL=30m`, `PAYMENT_PROVIDER=simulated`, `SIMULATED_WEBHOOK_TOKEN`,
`HOLD_MINUTES=15`, `APP_URL`, `CORS_ORIGIN`, `CRON_SECRET`, `PORT`, `NODE_ENV`,
optional `MERCADOPAGO_ACCESS_TOKEN`, optional `SMTP_*`/`BREVO_*`.
Frontend: `API_PROXY_TARGET`, `APP_URL`, `NEXT_PUBLIC_DEMO_{CUSTOMER,PROVIDER,ADMIN}_{EMAIL,PASSWORD}`.
Both ship a complete `.env.example`. Secrets never committed.
