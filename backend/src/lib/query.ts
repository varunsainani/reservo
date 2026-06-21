import { BookingStatus } from "@prisma/client";

/** Parse a positive integer query param with a default + bound. */
export function parseIntParam(
  raw: unknown,
  def: number,
  min: number,
  max: number
): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = parseIntParam(query.page, 1, 1, 100_000);
  const pageSize = parseIntParam(query.pageSize, 20, 1, 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function parseStr(raw: unknown): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

const BOOKING_STATUSES = new Set<string>(Object.values(BookingStatus));

/**
 * Validate a status query param against the enum allowlist. Unknown values are
 * ignored (returns undefined) — never cast straight into the Postgres enum.
 */
export function parseBookingStatus(raw: unknown): BookingStatus | undefined {
  const v = parseStr(raw);
  if (v && BOOKING_STATUSES.has(v)) return v as BookingStatus;
  return undefined;
}
