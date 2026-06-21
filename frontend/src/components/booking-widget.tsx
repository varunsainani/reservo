"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock, Loader2, CalendarDays } from "lucide-react";
import { Button } from "./ui/button";
import { Input, Label, Textarea } from "./ui/input";
import { Spinner, useErrorMessage } from "./states";
import { getAvailability, createBooking, ApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { cn, toDateInput } from "@/lib/utils";
import type { ProviderDetail, Service, Slot } from "@/lib/api-types";

// Build the next N selectable days starting today (provider-local enough for a
// day picker; the backend does the precise tz slot math).
function nextDays(count: number): { value: string; date: Date }[] {
  const out: { value: string; date: Date }[] = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({ value: toDateInput(d), date: d });
  }
  return out;
}

export function BookingWidget({ provider }: { provider: ProviderDetail }) {
  const t = useTranslations("provider");
  const tc = useTranslations("common");
  const router = useRouter();
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const activeServices = useMemo(
    () => provider.services.filter((s) => s.active),
    [provider.services],
  );

  const [serviceId, setServiceId] = useState<string>(activeServices[0]?.id ?? "");
  const days = useMemo(() => nextDays(14), []);
  const [date, setDate] = useState<string>(days[0]?.value ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotTakenNote, setSlotTakenNote] = useState(false);

  const service = activeServices.find((s) => s.id === serviceId) as Service | undefined;

  const loadSlots = useCallback(async () => {
    if (!serviceId || !date) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSelectedSlot(null);
    try {
      const data = await getAvailability(provider.slug, serviceId, date);
      setSlots(data.slots);
    } catch (e) {
      setSlotsError(errMsg(e));
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [provider.slug, serviceId, date, errMsg]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!selectedSlot) errs.slot = t("validationSlot");
    if (!name.trim()) errs.name = t("validationName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = t("validationEmail");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    setSubmitError(null);
    setSlotTakenNote(false);
    if (!validate() || !selectedSlot || !service) return;
    setSubmitting(true);
    try {
      const res = await createBooking({
        providerSlug: provider.slug,
        serviceId: service.id,
        startsAt: selectedSlot,
        customer: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined },
        notes: notes.trim() || undefined,
      });
      // Prefer the checkout URL the backend returns; fall back to the canonical route.
      const url =
        res.payment?.checkoutUrl ||
        `/checkout/${res.booking.id}?token=${encodeURIComponent(res.booking.publicToken)}`;
      // Route within the app (strip an absolute APP_URL origin if present).
      router.push(toInternal(url));
    } catch (e) {
      if (e instanceof ApiError && e.code === "SLOT_TAKEN") {
        // The slot was taken between fetch and submit — refresh and prompt.
        setSlotTakenNote(true);
        setSelectedSlot(null);
        await loadSlots();
      } else {
        setSubmitError(errMsg(e));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (activeServices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-subtle p-6 text-center text-sm text-muted-foreground">
        {t("noServices")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Service */}
      <div>
        <Label>{t("selectService")}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {activeServices.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setServiceId(s.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                s.id === serviceId
                  ? "border-primary bg-accent/60 ring-1 ring-primary/30"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              <span className="text-sm font-medium text-foreground">{s.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t("minutes", { count: s.durationMin })} · {fmt.money(s.priceCents, s.currency)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Day */}
      <div>
        <Label>{t("selectDay")}</Label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => {
            const selected = d.value === date;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => setDate(d.value)}
                className={cn(
                  "flex min-w-[64px] shrink-0 flex-col items-center rounded-lg border px-2 py-2 transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                <span className="text-[11px] uppercase opacity-80">
                  {new Intl.DateTimeFormat(fmt.locale === "en" ? "en-US" : fmt.locale === "pt" ? "pt-BR" : "es-AR", {
                    weekday: "short",
                  }).format(d.date)}
                </span>
                <span className="text-base font-semibold leading-tight">{d.date.getDate()}</span>
                <span className="text-[10px] uppercase opacity-80">
                  {new Intl.DateTimeFormat(fmt.locale === "en" ? "en-US" : fmt.locale === "pt" ? "pt-BR" : "es-AR", {
                    month: "short",
                  }).format(d.date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Slots */}
      <div>
        <Label>{t("selectSlot")}</Label>
        {slotsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {t("loadingSlots")}
          </div>
        ) : slotsError ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-subtle p-3 text-sm">
            <span className="text-muted-foreground">{slotsError}</span>
            <Button size="sm" variant="outline" onClick={loadSlots}>
              {tc("retry")}
            </Button>
          </div>
        ) : slots.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t("noSlots")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {slots.map((s) => {
              const selected = s.startsAt === selectedSlot;
              return (
                <button
                  key={s.startsAt}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(s.startsAt);
                    setSlotTakenNote(false);
                    setFieldErrors((f) => ({ ...f, slot: "" }));
                  }}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {fmt.timeInTz(s.startsAt, provider.timezone)}
                </button>
              );
            })}
          </div>
        )}
        {slotTakenNote && (
          <p className="mt-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning">
            {t("slotTakenRetry")}
          </p>
        )}
        {fieldErrors.slot && <p className="mt-1 text-xs text-danger">{fieldErrors.slot}</p>}
      </div>

      {/* 4. Details */}
      <div>
        <Label>{t("yourDetails")}</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              aria-label={t("name")}
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>}
          </div>
          <div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              aria-label={t("email")}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p>}
          </div>
          <div className="sm:col-span-2">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("phonePlaceholder")}
              aria-label={t("phone")}
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              aria-label={t("notes")}
            />
          </div>
        </div>
      </div>

      {/* Summary + submit */}
      {service && selectedSlot && (
        <div className="rounded-xl border border-border bg-subtle p-4">
          <p className="mb-2 text-sm font-medium text-foreground">{t("summaryTitle")}</p>
          <dl className="space-y-1 text-sm">
            <Row label={t("summaryService")} value={service.name} />
            <Row
              label={t("summaryWhen")}
              value={fmt.inTz(selectedSlot, provider.timezone)}
            />
            <Row
              label={t("summaryDuration")}
              value={t("minutes", { count: service.durationMin })}
            />
            <div className="flex items-center justify-between border-t border-border pt-1.5">
              <dt className="font-medium text-foreground">{t("summaryPrice")}</dt>
              <dd className="font-semibold text-foreground">
                {fmt.money(service.priceCents, service.currency)}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {submitError && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{submitError}</p>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={submitting}
        onClick={submit}
      >
        {submitting ? (
          <>
            <Spinner className="text-primary-foreground" />
            {t("creatingBooking")}
          </>
        ) : (
          <>
            <CalendarDays className="h-4 w-4" />
            {t("continueToPayment")}
          </>
        )}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

// Turn an absolute checkout URL (APP_URL origin) into an internal path so the
// router navigates client-side instead of a full reload.
function toInternal(url: string): string {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
