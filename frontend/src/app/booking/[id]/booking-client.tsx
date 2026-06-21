"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  MessageCircle,
  Calendar,
  Hash,
  User,
  Tag,
  CreditCard,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, useErrorMessage } from "@/components/states";
import { BookingStatusBadge } from "@/components/status-badge";
import { getBooking } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { BookingPublic, BookingStatus } from "@/lib/api-types";

const TERMINAL: BookingStatus[] = ["CONFIRMED", "CANCELLED", "EXPIRED", "REFUNDED"];
const POLL_MS = 2000;

export function BookingClient({ id, token }: { id: string; token: string }) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [booking, setBooking] = useState<BookingPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const fetchOnce = useCallback(
    async (initial: boolean) => {
      try {
        const b = await getBooking(id, token);
        setBooking(b);
        setError(null);
        if (initial) setLoading(false);
        // Stop polling once the booking reaches a terminal state.
        if (TERMINAL.includes(b.status)) stopped.current = true;
        return b.status;
      } catch (e) {
        if (initial) {
          setError(errMsg(e));
          setLoading(false);
        }
        // On a transient poll error keep the last good state; stop on hard 404.
        return null;
      }
    },
    [id, token, errMsg],
  );

  useEffect(() => {
    if (!token) {
      setError(t("notFoundBody"));
      setLoading(false);
      return;
    }
    stopped.current = false;

    let active = true;
    const tick = async () => {
      if (!active) return;
      const status = await fetchOnce(false);
      if (!active) return;
      if (!stopped.current && status !== null) {
        timer.current = setTimeout(tick, POLL_MS);
      } else if (status === null && !stopped.current) {
        // transient failure: retry on the same cadence
        timer.current = setTimeout(tick, POLL_MS);
      }
    };

    // Initial fetch, then begin polling if not terminal.
    (async () => {
      const status = await fetchOnce(true);
      if (!active) return;
      if (status && !TERMINAL.includes(status)) {
        timer.current = setTimeout(tick, POLL_MS);
      }
    })();

    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --- Loading / hard error ---
  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <LoadingState />
        </div>
      </AppShell>
    );
  }
  if (error || !booking) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <Card className="p-8 text-center">
            <h1 className="text-lg font-semibold tracking-tight">{t("notFoundTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error || t("notFoundBody")}</p>
            <Link href="/" className="mt-5 inline-block">
              <Button variant="outline">{tc("back")}</Button>
            </Link>
          </Card>
        </div>
      </AppShell>
    );
  }

  const status = booking.status;
  const confirmed = status === "CONFIRMED";
  const waiting = status === "PENDING_PAYMENT";
  const rejected = booking.payment?.status === "REJECTED";
  const expired = status === "EXPIRED";
  const cancelled = status === "CANCELLED";
  const refunded = status === "REFUNDED";

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        {/* Status hero */}
        <Card className="overflow-hidden">
          <div
            className={
              confirmed
                ? "bg-success/10 p-7 text-center"
                : waiting
                  ? "bg-warning/10 p-7 text-center"
                  : "bg-muted p-7 text-center"
            }
          >
            {waiting ? (
              <WaitingHero title={t("waitingTitle")} body={t("waitingBody")} live={t("live")} />
            ) : confirmed ? (
              <StatusHero
                icon={<CheckCircle2 className="h-10 w-10 text-success" />}
                title={t("confirmedTitle")}
                body={t("confirmedBody")}
              />
            ) : rejected && !cancelled && !refunded ? (
              <StatusHero
                icon={<XCircle className="h-10 w-10 text-danger" />}
                title={t("rejectedTitle")}
                body={t("rejectedBody")}
              />
            ) : expired ? (
              <StatusHero
                icon={<Clock className="h-10 w-10 text-muted-foreground" />}
                title={t("expiredTitle")}
                body={t("expiredBody")}
              />
            ) : cancelled ? (
              <StatusHero
                icon={<XCircle className="h-10 w-10 text-muted-foreground" />}
                title={t("cancelledTitle")}
                body={t("cancelledBody")}
              />
            ) : refunded ? (
              <StatusHero
                icon={<CreditCard className="h-10 w-10 text-muted-foreground" />}
                title={t("refundedTitle")}
                body={t("refundedBody")}
              />
            ) : (
              <StatusHero
                icon={<Clock className="h-10 w-10 text-muted-foreground" />}
                title={t("rejectedTitle")}
                body={t("rejectedBody")}
              />
            )}
          </div>

          {/* Receipt / details */}
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t("receiptTitle")}</p>
              <BookingStatusBadge status={status} />
            </div>
            <dl className="space-y-3 text-sm">
              <DetailRow icon={<Tag className="h-4 w-4" />} label={t("service")} value={booking.service.name} />
              <DetailRow icon={<User className="h-4 w-4" />} label={t("provider")} value={booking.provider.name} />
              <DetailRow
                icon={<Calendar className="h-4 w-4" />}
                label={t("when")}
                value={fmt.inTz(booking.startsAt, booking.provider.timezone)}
              />
              <DetailRow
                icon={<Clock className="h-4 w-4" />}
                label={t("duration")}
                value={`${booking.service.durationMin} min`}
              />
              <DetailRow
                icon={<CreditCard className="h-4 w-4" />}
                label={t("price")}
                value={fmt.money(booking.priceCents, booking.currency)}
              />
              <DetailRow icon={<User className="h-4 w-4" />} label={t("customer")} value={booking.customerName} />
              <DetailRow
                icon={<Hash className="h-4 w-4" />}
                label={t("reference")}
                value={booking.id.slice(-8).toUpperCase()}
                mono
              />
            </dl>

            {/* Actions */}
            <div className="mt-6 space-y-2">
              {confirmed && (
                <WhatsAppLink booking={booking} label={t("whatsappCta")} />
              )}
              {(expired || rejected) && !cancelled && !refunded && (
                <Link href={`/p/${booking.provider.slug}`} className="block">
                  <Button className="w-full">
                    {rejected ? t("retryPayment") : t("bookAgain")}
                  </Button>
                </Link>
              )}
              {(cancelled || refunded) && (
                <Link href={`/p/${booking.provider.slug}`} className="block">
                  <Button variant="outline" className="w-full">
                    {t("bookAgain")}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function WaitingHero({ title, body, live }: { title: string; body: string; live: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <Loader2 className="h-10 w-10 animate-spin text-warning" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <Badge tone="warning" className="animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {live}
        </Badge>
      </div>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function StatusHero({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center">
      {icon}
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="inline-flex items-center gap-2 text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </dt>
      <dd className={`text-right font-medium text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function WhatsAppLink({ booking, label }: { booking: BookingPublic; label: string }) {
  const fmt = useFormat();
  const phone = (booking.provider.whatsapp || "").replace(/\D/g, "");
  if (!phone) return null;
  const when = fmt.inTz(booking.startsAt, booking.provider.timezone);
  const text = encodeURIComponent(
    `${booking.customerName} — ${booking.service.name} @ ${booking.provider.name} (${when})`,
  );
  return (
    <a href={`https://wa.me/${phone}?text=${text}`} target="_blank" rel="noopener noreferrer" className="block">
      <Button className="w-full" variant="success">
        <MessageCircle className="h-4 w-4" />
        {label}
      </Button>
    </a>
  );
}
