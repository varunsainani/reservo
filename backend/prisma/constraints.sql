-- Double-booking guard (SPEC §2 / §6). Idempotent.
-- Two active bookings can never share the same provider + start slot.
CREATE UNIQUE INDEX IF NOT EXISTS booking_active_slot_uq
  ON "Booking" ("providerId", "startsAt")
  WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED');
