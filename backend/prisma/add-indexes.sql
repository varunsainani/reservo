-- Supplementary indexes for Reservo. Idempotent — safe to re-run.
--
-- This matches the Prisma-managed name for @@index([status, holdExpiresAt]) on
-- Booking, so applying it out-of-band stays consistent with the schema. It backs
-- the cron expiry scan (PENDING_PAYMENT bookings whose holdExpiresAt < now) and
-- the write-path hold-expiry sweep in createBooking.
CREATE INDEX IF NOT EXISTS "Booking_status_holdExpiresAt_idx"
  ON "Booking" ("status", "holdExpiresAt");
