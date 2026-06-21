import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  authLimiter,
  searchLimiter,
  bookingLimiter,
  webhookLimiter,
} from "../middleware/rate-limit";
import * as auth from "../controllers/auth";
import * as pub from "../controllers/public";
import * as payments from "../controllers/payments";
import * as me from "../controllers/me";
import * as admin from "../controllers/admin";
import * as customer from "../controllers/customer";

export function buildRouter(): Router {
  const r = Router();

  // ── Auth ───────────────────────────────────────────────────────────────
  r.post("/auth/register", authLimiter, asyncHandler(auth.register));
  r.post("/auth/login", authLimiter, asyncHandler(auth.login));
  r.post("/auth/refresh", authLimiter, asyncHandler(auth.refresh));
  r.post("/auth/logout", asyncHandler(auth.logout));
  r.get("/auth/me", requireAuth, asyncHandler(auth.me));

  // ── Public providers + booking ─────────────────────────────────────────
  r.get("/providers", searchLimiter, asyncHandler(pub.listProviders));
  r.get("/providers/:slug", searchLimiter, asyncHandler(pub.getProvider));
  r.get(
    "/providers/:slug/availability",
    searchLimiter,
    asyncHandler(pub.getAvailability)
  );
  r.post("/bookings", bookingLimiter, asyncHandler(pub.createBooking));
  r.get("/bookings/:id", asyncHandler(pub.getBookingPublic));

  // ── Payments / webhook / cron ──────────────────────────────────────────
  r.post("/payments/simulate", bookingLimiter, asyncHandler(payments.simulatePayment));
  r.post("/webhooks/payments", webhookLimiter, asyncHandler(payments.paymentsWebhook));
  r.post("/cron/release-expired", webhookLimiter, asyncHandler(payments.releaseExpired));

  // ── Customer area (role CUSTOMER) ──────────────────────────────────────
  r.get(
    "/me/bookings-customer",
    requireRole("CUSTOMER"),
    asyncHandler(customer.listCustomerBookings)
  );

  // ── Provider area (role PROVIDER) ──────────────────────────────────────
  const provider = requireRole("PROVIDER");
  r.get("/me/provider", provider, asyncHandler(me.getMyProvider));
  r.put("/me/provider", provider, asyncHandler(me.updateMyProvider));

  r.get("/me/services", provider, asyncHandler(me.listMyServices));
  r.post("/me/services", provider, asyncHandler(me.createMyService));
  r.put("/me/services/:id", provider, asyncHandler(me.updateMyService));
  r.delete("/me/services/:id", provider, asyncHandler(me.deleteMyService));

  r.get("/me/availability", provider, asyncHandler(me.getMyAvailability));
  r.put("/me/availability", provider, asyncHandler(me.setMyAvailability));

  r.get("/me/blocks", provider, asyncHandler(me.listMyBlocks));
  r.post("/me/blocks", provider, asyncHandler(me.createMyBlock));
  r.delete("/me/blocks/:id", provider, asyncHandler(me.deleteMyBlock));

  r.get("/me/bookings", provider, asyncHandler(me.listMyBookings));
  r.patch("/me/bookings/:id", provider, asyncHandler(me.patchMyBooking));

  r.get("/me/stats", provider, asyncHandler(me.getMyStats));

  // ── Admin area (role ADMIN) ────────────────────────────────────────────
  const adminOnly = requireRole("ADMIN");
  r.get("/admin/overview", adminOnly, asyncHandler(admin.overview));
  r.get("/admin/bookings", adminOnly, asyncHandler(admin.listBookings));
  r.patch("/admin/bookings/:id", adminOnly, asyncHandler(admin.patchBooking));
  r.get("/admin/providers", adminOnly, asyncHandler(admin.listProvidersAdmin));

  return r;
}
