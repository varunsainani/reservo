import { DateTime } from "luxon";

export interface Slot {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
}

export interface AvailabilityWindow {
  weekday: number; // 0=Sun .. 6=Sat
  startMinute: number;
  endMinute: number;
}

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface ComputeSlotsArgs {
  timezone: string;
  durationMin: number;
  /** YYYY-MM-DD in the provider's local timezone. */
  date: string;
  rules: AvailabilityWindow[];
  /** TimeBlocks + active bookings (overlap excludes a candidate slot). */
  busy: BusyInterval[];
  /** "Now" — defaults to the real clock; injectable for tests. */
  now?: Date;
  /** Minimum lead time (minutes) before a slot may be booked today. */
  leadMinutes?: number;
}

/** Luxon weekday is 1=Mon..7=Sun; convert to JS 0=Sun..6=Sat. */
function luxonToJsWeekday(luxonWeekday: number): number {
  return luxonWeekday % 7; // 7(Sun)->0, 1(Mon)->1 ... 6(Sat)->6
}

/**
 * Half-open interval overlap test: [aStart, aEnd) overlaps [bStart, bEnd).
 * Accepts numbers (epoch ms) so callers can pass Date.getTime() directly.
 */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Compute bookable slots for a provider+service on a local calendar date.
 * SPEC §3. All returned timestamps are UTC ISO. Slot math is timezone-correct:
 * local availability minutes are mapped to UTC instants via the IANA zone,
 * which handles DST transitions.
 */
export function computeSlots(args: ComputeSlotsArgs): Slot[] {
  const {
    timezone,
    durationMin,
    date,
    rules,
    busy,
    now = new Date(),
    leadMinutes = 60,
  } = args;

  if (!durationMin || durationMin <= 0) return [];

  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  if (!dayStart.isValid) return [];

  const jsWeekday = luxonToJsWeekday(dayStart.weekday);
  const windows = rules.filter((r) => r.weekday === jsWeekday);
  if (windows.length === 0) return [];

  const nowMs = now.getTime();
  const earliestBookableMs = nowMs + leadMinutes * 60 * 1000;

  const busyMs = busy.map((b) => ({
    start: b.startsAt.getTime(),
    end: b.endsAt.getTime(),
  }));

  const slots: Slot[] = [];
  const seen = new Set<number>();

  for (const w of windows) {
    if (w.endMinute <= w.startMinute) continue;
    for (
      let m = w.startMinute;
      m + durationMin <= w.endMinute;
      m += durationMin
    ) {
      // Map local minute-of-day to a concrete instant in the provider's zone.
      const startLocal = dayStart.plus({ minutes: m });
      const endLocal = startLocal.plus({ minutes: durationMin });
      const startUtc = startLocal.toUTC();
      const endUtc = endLocal.toUTC();
      const startMs = startUtc.toMillis();
      const endMs = endUtc.toMillis();

      // De-dup across overlapping rules.
      if (seen.has(startMs)) continue;

      // Drop slots that start before the lead cutoff (covers "today" + past days).
      if (startMs < earliestBookableMs) continue;

      // Drop if it overlaps any busy interval.
      const blocked = busyMs.some((b) => overlaps(startMs, endMs, b.start, b.end));
      if (blocked) continue;

      seen.add(startMs);
      slots.push({
        startsAt: startUtc.toISO({ suppressMilliseconds: true }) ?? startUtc.toISO()!,
        endsAt: endUtc.toISO({ suppressMilliseconds: true }) ?? endUtc.toISO()!,
      });
    }
  }

  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return slots;
}

/**
 * Validate that a requested startsAt aligns to a real bookable slot for the
 * service/provider, and compute its endsAt. Returns null if invalid (not on the
 * grid, in the past, or overlapping a busy interval).
 */
export function resolveSlot(args: {
  timezone: string;
  durationMin: number;
  startsAt: Date;
  rules: AvailabilityWindow[];
  busy: BusyInterval[];
  now?: Date;
  leadMinutes?: number;
}): { startsAt: Date; endsAt: Date } | null {
  const { timezone, startsAt } = args;
  const local = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(timezone);
  if (!local.isValid) return null;
  const date = local.toFormat("yyyy-MM-dd");

  const slots = computeSlots({
    timezone,
    durationMin: args.durationMin,
    date,
    rules: args.rules,
    busy: args.busy,
    now: args.now,
    leadMinutes: args.leadMinutes,
  });

  const wantMs = startsAt.getTime();
  const match = slots.find((s) => new Date(s.startsAt).getTime() === wantMs);
  if (!match) return null;
  return { startsAt: new Date(match.startsAt), endsAt: new Date(match.endsAt) };
}

/** True if a startsAt instant is strictly in the past relative to now. */
export function isPast(startsAt: Date, now: Date = new Date()): boolean {
  return startsAt.getTime() <= now.getTime();
}
