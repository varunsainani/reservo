"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, X, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  Spinner,
  useErrorMessage,
} from "@/components/states";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import {
  listAdminBookings,
  listAdminProviders,
  patchAdminBooking,
} from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { BookingAdmin, BookingStatus, AdminProviderRow } from "@/lib/api-types";

const STATUS_OPTIONS: BookingStatus[] = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
];
const PAGE_SIZE = 20;

function AdminBookingsInner() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tStatus = useTranslations("bookingStatus");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [items, setItems] = useState<BookingAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<BookingStatus | "">("");
  const [providerId, setProviderId] = useState("");
  const [providers, setProviders] = useState<AdminProviderRow[]>([]);

  const [cancelTarget, setCancelTarget] = useState<BookingAdmin | null>(null);
  const [refundTarget, setRefundTarget] = useState<BookingAdmin | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load the provider list once for the filter dropdown.
  useEffect(() => {
    listAdminProviders({ pageSize: 100 })
      .then((d) => setProviders(d.items))
      .catch(() => setProviders([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminBookings({
        status: status || undefined,
        providerId: providerId || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [status, providerId, page, errMsg]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [status, providerId]);

  async function runAction(target: BookingAdmin, action: "cancel" | "refund") {
    setActionBusy(true);
    setActionError(null);
    try {
      await patchAdminBooking(target.id, action);
      setCancelTarget(null);
      setRefundTarget(null);
      await load();
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader title={t("bookingsTitle")} subtitle={t("bookingsSubtitle")} />

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-status">{t("filterStatus")}</Label>
            <Select
              id="f-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BookingStatus | "")}
            >
              <option value="">{tc("all")}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {tStatus(s)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-provider">{t("filterProvider")}</Label>
            <Select id="f-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">{t("allProviders")}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyBody")}
          icon={<CalendarDays className="h-5 w-5" />}
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((b) => {
              const canCancel = b.status === "CONFIRMED" || b.status === "PENDING_PAYMENT";
              const canRefund = b.status === "CONFIRMED";
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{b.service.name}</p>
                        <BookingStatusBadge status={b.status} />
                        <PaymentStatusBadge status={b.payment.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground/80">{b.provider.name}</span>
                        <span>{b.customerName}</span>
                        <span>{fmt.inTz(b.startsAt, b.provider.timezone)}</span>
                        <span className="font-medium text-foreground">
                          {fmt.money(b.priceCents, b.currency)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canRefund && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionError(null);
                            setRefundTarget(b);
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {t("refund")}
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setActionError(null);
                            setCancelTarget(b);
                          }}
                        >
                          <X className="h-4 w-4" />
                          {t("cancel")}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
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

      {/* Cancel modal */}
      <Modal
        open={!!cancelTarget}
        onClose={() => !actionBusy && setCancelTarget(null)}
        title={t("cancelConfirmTitle")}
      >
        <p className="text-sm text-muted-foreground">{t("cancelConfirmBody")}</p>
        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={actionBusy} onClick={() => setCancelTarget(null)}>
            {tc("close")}
          </Button>
          <Button
            variant="danger"
            disabled={actionBusy}
            onClick={() => cancelTarget && runAction(cancelTarget, "cancel")}
          >
            {actionBusy ? <Spinner className="text-white" /> : t("cancel")}
          </Button>
        </div>
      </Modal>

      {/* Refund modal */}
      <Modal
        open={!!refundTarget}
        onClose={() => !actionBusy && setRefundTarget(null)}
        title={t("refundConfirmTitle")}
      >
        <p className="text-sm text-muted-foreground">{t("refundConfirmBody")}</p>
        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={actionBusy} onClick={() => setRefundTarget(null)}>
            {tc("close")}
          </Button>
          <Button
            disabled={actionBusy}
            onClick={() => refundTarget && runAction(refundTarget, "refund")}
          >
            {actionBusy ? <Spinner className="text-primary-foreground" /> : t("refund")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminBookingsPage() {
  return (
    <AppShell>
      <RoleGuard allow={["ADMIN"]}>
        <AdminBookingsInner />
      </RoleGuard>
    </AppShell>
  );
}
