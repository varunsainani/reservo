"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "./ui/badge";
import type { BookingStatus, PaymentStatus } from "@/lib/api-types";

const BOOKING_TONE: Record<BookingStatus, BadgeTone> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  REFUNDED: "info",
};

const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
  REFUNDED: "info",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("bookingStatus");
  return <Badge tone={BOOKING_TONE[status]}>{t(status)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations("paymentStatus");
  return <Badge tone={PAYMENT_TONE[status]}>{t(status)}</Badge>;
}
