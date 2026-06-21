"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, Clock, Ticket } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  useErrorMessage,
} from "@/components/states";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { listMyBookings, ApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { BookingAdmin } from "@/lib/api-types";

function MyBookingsInner() {
  const t = useTranslations("myBookings");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [items, setItems] = useState<BookingAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMyBookings();
      setItems(data.items);
    } catch (e) {
      // A 404 here means the backend didn't expose this exact route; treat as empty.
      if (e instanceof ApiError && e.status === 404) {
        setItems([]);
      } else {
        setError(errMsg(e));
      }
    } finally {
      setLoading(false);
    }
  }, [errMsg]);

  useEffect(() => {
    load();
  }, [load]);

  const now = Date.now();
  const upcoming = items
    .filter((b) => new Date(b.startsAt).getTime() >= now && b.status !== "CANCELLED")
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const past = items
    .filter((b) => new Date(b.startsAt).getTime() < now || b.status === "CANCELLED")
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyBody")}
          icon={<Ticket className="h-5 w-5" />}
          action={
            <Link href="/">
              <Button>{t("browse")}</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("upcoming")}
              </h2>
              <div className="space-y-3">
                {upcoming.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("past")}
              </h2>
              <div className="space-y-3">
                {past.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );

  function BookingRow({ booking }: { booking: BookingAdmin }) {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{booking.service.name}</p>
            <BookingStatusBadge status={booking.status} />
            <PaymentStatusBadge status={booking.payment.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {fmt.inTz(booking.startsAt, booking.provider.timezone)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {booking.provider.name}
            </span>
            <span className="font-medium text-foreground">
              {fmt.money(booking.priceCents, booking.currency)}
            </span>
          </div>
        </div>
      </Card>
    );
  }
}

export default function MyBookingsPage() {
  return (
    <AppShell>
      <RoleGuard allow={["CUSTOMER"]}>
        <MyBookingsInner />
      </RoleGuard>
    </AppShell>
  );
}
