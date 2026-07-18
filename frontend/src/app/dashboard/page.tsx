"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  CheckCircle2,
  DollarSign,
  Hourglass,
  Scissors,
  Clock,
  CalendarRange,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState, useErrorMessage } from "@/components/states";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { getMyStats, getMyProvider, listMyProviderBookings } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { ProviderStats, ProviderDetail, BookingAdmin } from "@/lib/api-types";

function DashboardInner() {
  const t = useTranslations("dashboard");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [stats, setStats] = useState<ProviderStats | null>(null);
  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [upcoming, setUpcoming] = useState<BookingAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date().toISOString();
      const [s, p, b] = await Promise.all([
        getMyStats(),
        getMyProvider(),
        listMyProviderBookings({ from }),
      ]);
      setStats(s);
      setProvider(p);
      setUpcoming(
        b.items
          .filter((x) => x.status === "CONFIRMED" || x.status === "PENDING_PAYMENT")
          .sort((a, c) => +new Date(a.startsAt) - +new Date(c.startsAt))
          .slice(0, 6),
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [errMsg]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const needsSetup =
    provider && (provider.services.length === 0 || (provider.availability?.length ?? 0) === 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          provider && (
            <Link href={`/p/${provider.slug}`} target="_blank">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ExternalLink className="h-4 w-4" />
                {t("publicPage")}
              </span>
            </Link>
          )
        }
      />

      {needsSetup && (
        <Card className="mb-6 border-primary/30 bg-accent/40 p-5">
          <p className="font-medium text-foreground">{t("setupTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("setupBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/services">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                <Scissors className="h-4 w-4" />
                {t("manageServices")}
              </span>
            </Link>
            <Link href="/dashboard/availability">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium">
                <Clock className="h-4 w-4" />
                {t("editAvailability")}
              </span>
            </Link>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("statUpcoming")}
          value={stats?.upcoming ?? 0}
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <StatCard
          label={t("statConfirmedMonth")}
          value={stats?.confirmedThisMonth ?? 0}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          label={t("statRevenue")}
          value={fmt.money(stats?.revenueCents ?? 0, provider?.services[0]?.currency ?? "USD")}
          hint={t("revenueNote")}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label={t("statPending")}
          value={stats?.pendingCount ?? 0}
          icon={<Hourglass className="h-5 w-5" />}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Next up */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold tracking-tight">{t("nextUp")}</h2>
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {t("viewCalendar")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noUpcoming")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{b.service.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.customerName} · {fmt.inTz(b.startsAt, b.provider.timezone)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <BookingStatusBadge status={b.status} />
                    <PaymentStatusBadge status={b.payment.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Quick actions */}
        <Card className="p-5">
          <h2 className="mb-4 font-semibold tracking-tight">{t("quickActions")}</h2>
          <div className="space-y-2">
            <QuickLink href="/dashboard/calendar" icon={<CalendarRange className="h-4 w-4" />}>
              {t("viewCalendar")}
            </QuickLink>
            <QuickLink href="/dashboard/services" icon={<Scissors className="h-4 w-4" />}>
              {t("manageServices")}
            </QuickLink>
            <QuickLink href="/dashboard/availability" icon={<Clock className="h-4 w-4" />}>
              {t("editAvailability")}
            </QuickLink>
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        {children}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <RoleGuard allow={["PROVIDER"]}>
        <DashboardInner />
      </RoleGuard>
    </AppShell>
  );
}
