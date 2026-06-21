"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  useErrorMessage,
} from "@/components/states";
import { listAdminProviders } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { categoryKey } from "@/lib/categories";
import { initials } from "@/lib/utils";
import type { AdminProviderRow } from "@/lib/api-types";

const PAGE_SIZE = 20;

function AdminProvidersInner() {
  const t = useTranslations("admin");
  const tCat = useTranslations("categories");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [items, setItems] = useState<AdminProviderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminProviders({ page, pageSize: PAGE_SIZE });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [page, errMsg]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader title={t("providersTitle")} subtitle={t("providersSubtitle")} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("noProviders")}
          icon={<Users className="h-5 w-5" />}
        />
      ) : (
        <>
          {/* Table on sm+, cards on mobile */}
          <Card className="hidden overflow-hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-subtle text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("providerName")}</th>
                  <th className="px-4 py-3 font-medium">{t("category")}</th>
                  <th className="px-4 py-3 font-medium">{t("location")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("services")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("bookings")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("revenue")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                          {initials(p.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{p.name}</p>
                          {p.ownerEmail && (
                            <p className="truncate text-xs text-muted-foreground">{p.ownerEmail}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{tCat(categoryKey(p.category))}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.city || "—"}</td>
                    <td className="px-4 py-3 text-right">{p.serviceCount}</td>
                    <td className="px-4 py-3 text-right">{p.bookingCount}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {fmt.money(p.revenueCents, "BRL")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/p/${p.slug}`} target="_blank" aria-label={p.name}>
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {items.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{p.name}</p>
                      <Badge tone="info">{tCat(categoryKey(p.category))}</Badge>
                    </div>
                  </div>
                  <Link href={`/p/${p.slug}`} target="_blank" aria-label={p.name}>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("services")}</p>
                    <p className="font-medium">{p.serviceCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("bookings")}</p>
                    <p className="font-medium">{p.bookingCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("revenue")}</p>
                    <p className="font-medium">{fmt.money(p.revenueCents, "BRL")}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("prev")}
              </Button>
              <span className="text-sm text-muted-foreground">{t("pageOf", { page, pages })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                {t("nextPage")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminProvidersPage() {
  return (
    <AppShell>
      <RoleGuard allow={["ADMIN"]}>
        <AdminProvidersInner />
      </RoleGuard>
    </AppShell>
  );
}
