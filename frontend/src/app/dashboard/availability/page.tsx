"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Check, CalendarOff } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  LoadingState,
  ErrorState,
  Spinner,
  useErrorMessage,
} from "@/components/states";
import {
  getMyAvailability,
  putMyAvailability,
  listMyBlocks,
  createMyBlock,
  deleteMyBlock,
} from "@/lib/api";
import { useFormat } from "@/lib/format";
import { minutesToHHMM, hhmmToMinutes } from "@/lib/utils";
import type { AvailabilityRule, TimeBlock } from "@/lib/api-types";

interface Range {
  start: string; // HH:mm
  end: string;
}
type WeekRanges = Record<number, Range[]>;

function rulesToWeek(rules: AvailabilityRule[]): WeekRanges {
  const w: WeekRanges = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of rules) {
    if (!w[r.weekday]) w[r.weekday] = [];
    w[r.weekday].push({ start: minutesToHHMM(r.startMinute), end: minutesToHHMM(r.endMinute) });
  }
  return w;
}

function AvailabilityInner() {
  const t = useTranslations("availability");
  const tc = useTranslations("common");
  const tWeekday = useTranslations("availability.weekday");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [week, setWeek] = useState<WeekRanges>(rulesToWeek([]));
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingWeek, setSavingWeek] = useState(false);
  const [weekSaved, setWeekSaved] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([getMyAvailability(), listMyBlocks()]);
      setWeek(rulesToWeek(a.rules));
      setBlocks(
        b.items.sort((x, y) => +new Date(x.startsAt) - +new Date(y.startsAt)),
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

  function addRange(day: number) {
    setWeek((w) => ({ ...w, [day]: [...w[day], { start: "09:00", end: "17:00" }] }));
  }
  function removeRange(day: number, idx: number) {
    setWeek((w) => ({ ...w, [day]: w[day].filter((_, i) => i !== idx) }));
  }
  function setRange(day: number, idx: number, key: keyof Range, value: string) {
    setWeek((w) => ({
      ...w,
      [day]: w[day].map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    }));
  }

  async function saveWeek() {
    setWeekError(null);
    setWeekSaved(false);
    // Build the rules array, validating each range.
    const rules: AvailabilityRule[] = [];
    for (let day = 0; day <= 6; day++) {
      for (const r of week[day]) {
        const s = hhmmToMinutes(r.start);
        const e = hhmmToMinutes(r.end);
        if (s === null || e === null || e <= s) {
          setWeekError(t("invalidRange"));
          return;
        }
        rules.push({ weekday: day, startMinute: s, endMinute: e });
      }
    }
    setSavingWeek(true);
    try {
      await putMyAvailability(rules);
      setWeekSaved(true);
      setTimeout(() => setWeekSaved(false), 1800);
    } catch (e) {
      setWeekError(errMsg(e));
    } finally {
      setSavingWeek(false);
    }
  }

  async function addBlock() {
    setBlockError(null);
    if (!blockStart || !blockEnd) return;
    const startsAt = new Date(blockStart);
    const endsAt = new Date(blockEnd);
    if (endsAt <= startsAt) {
      setBlockError(t("invalidRange"));
      return;
    }
    setBlockBusy(true);
    try {
      await createMyBlock({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: blockReason.trim() || undefined,
      });
      setBlockStart("");
      setBlockEnd("");
      setBlockReason("");
      await load();
    } catch (e) {
      setBlockError(errMsg(e));
    } finally {
      setBlockBusy(false);
    }
  }

  async function removeBlock(id: string) {
    try {
      await deleteMyBlock(id);
      setBlocks((bs) => bs.filter((b) => b.id !== id));
    } catch (e) {
      setBlockError(errMsg(e));
    }
  }

  if (loading)
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <LoadingState />
      </div>
    );
  if (error)
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <ErrorState message={error} onRetry={load} />
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Weekly template */}
      <Card className="p-5">
        <h2 className="font-semibold tracking-tight">{t("weeklyTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("weeklyBody")}</p>
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <div
              key={day}
              className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-start"
            >
              <div className="w-28 shrink-0 pt-1.5 text-sm font-medium text-foreground">
                {tWeekday(String(day))}
              </div>
              <div className="flex-1 space-y-2">
                {week[day].length === 0 ? (
                  <p className="py-1.5 text-sm text-muted-foreground">{t("closed")}</p>
                ) : (
                  week[day].map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={r.start}
                        onChange={(e) => setRange(day, idx, "start", e.target.value)}
                        className="w-32"
                        aria-label={t("start")}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={r.end}
                        onChange={(e) => setRange(day, idx, "end", e.target.value)}
                        className="w-32"
                        aria-label={t("end")}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={tc("delete")}
                        onClick={() => removeRange(day, idx)}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  ))
                )}
                <Button size="sm" variant="ghost" onClick={() => addRange(day)}>
                  <Plus className="h-4 w-4" />
                  {t("addRange")}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={savingWeek} onClick={saveWeek}>
            {savingWeek ? <Spinner className="text-primary-foreground" /> : t("saveWeekly")}
          </Button>
          {weekSaved && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" />
              {t("saved")}
            </span>
          )}
          {weekError && <span className="text-sm text-danger">{weekError}</span>}
        </div>
      </Card>

      {/* Time blocks */}
      <Card className="mt-6 p-5">
        <h2 className="font-semibold tracking-tight">{t("blocksTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("blocksBody")}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="b-start">{t("blockStart")}</Label>
            <Input
              id="b-start"
              type="datetime-local"
              value={blockStart}
              onChange={(e) => setBlockStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="b-end">{t("blockEnd")}</Label>
            <Input
              id="b-end"
              type="datetime-local"
              value={blockEnd}
              onChange={(e) => setBlockEnd(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="b-reason">{t("blockReason")}</Label>
            <Input
              id="b-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder={t("blockReasonPlaceholder")}
            />
          </div>
          <Button disabled={blockBusy || !blockStart || !blockEnd} onClick={addBlock}>
            {blockBusy ? <Spinner className="text-primary-foreground" /> : <Plus className="h-4 w-4" />}
            {t("addBlock")}
          </Button>
        </div>
        {blockError && <p className="mt-2 text-sm text-danger">{blockError}</p>}

        <div className="mt-5">
          {blocks.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <CalendarOff className="h-4 w-4" />
              {t("noBlocks")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-foreground">
                      {fmt.dateTime(b.startsAt)} → {fmt.dateTime(b.endsAt)}
                    </p>
                    {b.reason && <p className="text-muted-foreground">{b.reason}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeBlock(b.id)}
                    aria-label={t("deleteBlock")}
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                    {t("deleteBlock")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <AppShell>
      <RoleGuard allow={["PROVIDER"]}>
        <AvailabilityInner />
      </RoleGuard>
    </AppShell>
  );
}
