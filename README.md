# Reservo

A booking platform for appointment-based businesses (clinics, salons,
consultants, studios) with a real Latin American payment loop. A customer picks
a free slot, pays with Pix or card, and the booking **confirms itself the moment
the payment webhook fires**, with no manual step.

**Live demo:** https://reservo-tan.vercel.app — on the login page use a one-click
demo button (customer, professional, or admin); no signup needed.

## Features

- 📅 **Self-confirming bookings** — pick a service and a free slot, check out,
  and watch the booking flip from "waiting for payment" to "confirmed" in real
  time as the payment webhook lands. Confirmation happens only in the webhook
  path, never client-side.
- 💳 **Payment provider behind an interface** — the live demo runs a built-in
  simulated Pix/card checkout that drives the exact same webhook-to-confirm
  pipeline a real provider would. A full **MercadoPago** integration (Checkout
  Pro / Pix + card, signature-verified webhook) is implemented and selectable by
  config.
- 🗓️ **Provider calendar** — define services (duration + price), a weekly
  availability template and one-off blocked times; see every booking with its
  payment status; cancel or reschedule.
- 🛡️ **Booking integrity** — a transactional hold plus an interval-overlap guard
  and a partial unique index prevent double-booking (including different-duration
  overlaps); unpaid holds release via lazy expiry (and an optional cron); the
  webhook is idempotent; slot math is timezone-correct.
- 🛠️ **Admin** — every booking and payment across providers, a revenue overview,
  cancel/refund.
- 🌍 **Trilingual (PT / EN / ES)** — UI and API messages localized (Pix is
  Brazil-first, so Portuguese leads), resolved via an `X-Locale` header with
  `Accept-Language` fallback. Currency/date formatting per locale.
- 🌗 **Light / dark themes**, mobile-first responsive, JWT auth with refresh
  rotation and role-based access (customer / professional / admin).

## Tech stack

| Layer    | Technology                                                          |
| -------- | ------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, next-intl     |
| Backend  | Node.js, Express, TypeScript, Prisma                                |
| Database | PostgreSQL (Neon)                                                    |
| Payments | Simulated provider (demo) + MercadoPago (Pix/card), behind an interface |
| Hosting  | Vercel (frontend + backend serverless) + Neon                       |

## Project structure

```
backend/    Express API, Prisma schema, slot engine, payment providers, webhook
frontend/   Next.js + Tailwind app (booking flow, dashboard, admin), i18n
```

The frontend proxies `/api/*` to the backend, so the whole product lives behind a
single URL.

## Running locally

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # set DATABASE_URL (Neon), DIRECT_URL, JWT + secrets
npm run prisma:push         # db push + applies prisma/constraints.sql
npm run seed                # demo accounts, providers, services, bookings
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # set API_PROXY_TARGET to the backend URL
npm run dev
```

Open http://localhost:3000.

## Payments

Payments sit behind a `PaymentProvider` interface (`backend/src/payments`). The
demo uses the **simulated** provider (`PAYMENT_PROVIDER=simulated`): the checkout
page posts to the real webhook endpoint so the confirm pipeline is exercised
exactly as a live provider would. Set `PAYMENT_PROVIDER=mercadopago` plus the
MercadoPago credentials to switch to real Pix/card checkout.
