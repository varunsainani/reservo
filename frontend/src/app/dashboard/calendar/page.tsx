"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, X, CalendarClock } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  Spinner,
  useErrorMessage,
} from "@/components/states";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { listMyProviderBookings, patchMyBooking } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { BookingAdmin, BookingStatus } from "@/lib/api-types";

const STATUS_OPTIONS: BookingStatus[] = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
];

function CalendarInner() {
  const t = useTranslations("calendar");
  const tc = useTranslations("common");
  const tStatus = useTranslations("bookingStatus");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [items, setItems] = useState<BookingAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<BookingStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [cancelTarget, setCancelTarget] = useState<BookingAdmin | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<BookingAdmin | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newStart, setNewStart] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMyProviderBookings({
        status: status || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      setItems(
        data.items.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [status, from, to, errMsg]);

  useEffect(() => {
    load();
  }, [load]);

  async function doCancel() {
    if (!cancelTarget) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await patchMyBooking(cancelTarget.id, { action: "cancel" });
      setCancelTarget(null);
      await load();
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function doReschedule() {
    if (!rescheduleTarget || !newStart) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await patchMyBooking(rescheduleTarget.id, {
        action: "reschedule",
        startsAt: new Date(newStart).toISOString(),
      });
      setRescheduleTarget(null);
      setNewStart("");
      await load();
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
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
            <Label htmlFor="f-from">{t("filterFrom")}</Label>
            <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-to">{t("filterTo")}</Label>
            <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <div className="space-y-3">
          {items.map((b) => {
            const canManage = b.status === "CONFIRMED" || b.status === "PENDING_PAYMENT";
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
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {fmt.inTz(b.startsAt, b.provider.timezone)}
                      </span>
                      <span>{b.customerName}</span>
                      <span className="truncate">{b.customerEmail}</span>
                      <span className="font-medium text-foreground">
                        {fmt.money(b.priceCents, b.currency)}
                      </span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActionError(null);
                          setNewStart("");
                          setRescheduleTarget(b);
                        }}
                      >
                        {t("reschedule")}
                      </Button>
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
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
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
          <Button variant="danger" disabled={actionBusy} onClick={doCancel}>
            {actionBusy ? <Spinner className="text-white" /> : t("cancelConfirmAction")}
          </Button>
        </div>
      </Modal>

      {/* Reschedule modal */}
      <Modal
        open={!!rescheduleTarget}
        onClose={() => !actionBusy && setRescheduleTarget(null)}
        title={t("rescheduleTitle")}
      >
        <p className="text-sm text-muted-foreground">{t("rescheduleBody")}</p>
        <div className="mt-4">
          <Label htmlFor="new-start">{t("rescheduleNewTime")}</Label>
          <Input
            id="new-start"
            type="datetime-local"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
        </div>
        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={actionBusy} onClick={() => setRescheduleTarget(null)}>
            {tc("close")}
          </Button>
          <Button disabled={actionBusy || !newStart} onClick={doReschedule}>
            {actionBusy ? <Spinner className="text-primary-foreground" /> : t("rescheduleAction")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <AppShell>
      <RoleGuard allow={["PROVIDER"]}>
        <CalendarInner />
      </RoleGuard>
    </AppShell>
  );
}
