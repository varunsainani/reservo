"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, CalendarDays, CheckCircle2, DollarSign, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState, useErrorMessage } from "@/components/states";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { getAdminOverview } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { AdminOverview } from "@/lib/api-types";

function AdminInner() {
  const t = useTranslations("admin");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminOverview());
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
  if (error || !data) return <ErrorState message={error || t("loadError")} onRetry={load} />;

  const b = data.bookings;
  const breakdown = [
    { label: t("pending"), value: b.pending, tone: "text-warning" },
    { label: t("confirmed"), value: b.confirmed, tone: "text-success" },
    { label: t("cancelled"), value: b.cancelled, tone: "text-muted-foreground" },
    { label: t("expired"), value: b.expired, tone: "text-muted-foreground" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("statProviders")} value={data.providers} icon={<Users className="h-5 w-5" />} />
        <StatCard label={t("statBookings")} value={b.total} icon={<CalendarDays className="h-5 w-5" />} />
        <StatCard label={t("statConfirmed")} value={b.confirmed} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard
          label={t("statRevenue")}
          value={fmt.money(data.revenueCents, "BRL")}
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Recent bookings */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold tracking-tight">{t("recentBookings")}</h2>
            <Link
              href="/admin/bookings"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {t("bookingsTitle")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data.recentBookings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noRecent")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentBookings.slice(0, 8).map((bk) => (
                <li key={bk.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{bk.service.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {bk.provider.name} · {bk.customerName} · {fmt.inTz(bk.startsAt, bk.provider.timezone)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <BookingStatusBadge status={bk.status} />
                    <PaymentStatusBadge status={bk.payment.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {/* Breakdown */}
          <Card className="p-5">
            <h2 className="mb-4 font-semibold tracking-tight">{t("breakdown")}</h2>
            <ul className="space-y-2.5">
              {breakdown.map((row) => (
                <li key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className={`font-semibold ${row.tone}`}>{row.value}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Top providers */}
          <Card className="p-5">
            <h2 className="mb-4 font-semibold tracking-tight">{t("topProviders")}</h2>
            {data.topProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noProviders")}</p>
            ) : (
              <ul className="space-y-3">
                {data.topProviders.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/p/${p.slug}`} className="truncate font-medium text-foreground hover:text-primary">
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-muted-foreground">
                      {fmt.money(p.revenueCents, "BRL")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AppShell>
      <RoleGuard allow={["ADMIN"]}>
        <AdminInner />
      </RoleGuard>
    </AppShell>
  );
}
