import type { NextFunction, Request, Response } from "express";
import { httpError } from "../lib/http-error";

/**
 * Dependency-free fixed-window rate limiter.
 *
 * NOTE: in-memory and therefore PER-INSTANCE. On Vercel serverless each cold
 * instance has its own counters, so this is BEST-EFFORT only (distributed
 * requests dilute it). A hard limit would need a shared store (Upstash/Redis).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of store) {
    if (b.resetAt <= now) store.delete(key);
  }
}

function clientKey(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const ip = Array.isArray(fwd)
    ? fwd[0]
    : (fwd?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress || "unknown");
  return ip;
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  bucket: string;
}) {
  const { windowMs, max, bucket } = opts;
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    sweep(now);

    const key = `${bucket}:${clientKey(req)}`;
    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      throw httpError(429, "errors.common.rateLimited", {
        code: "RATE_LIMITED",
      });
    }
    next();
  };
}

// Strict on auth (brute-force protection), looser on search/public reads.
export const authLimiter = rateLimit({ windowMs: 60_000, max: 20, bucket: "auth" });
export const searchLimiter = rateLimit({ windowMs: 60_000, max: 120, bucket: "search" });
export const bookingLimiter = rateLimit({ windowMs: 60_000, max: 40, bucket: "booking" });
// Loose guard on the unauthenticated/secret-guarded webhook + cron endpoints —
// abuse protection without throttling legitimate provider callbacks/cron pings.
export const webhookLimiter = rateLimit({ windowMs: 60_000, max: 240, bucket: "webhook" });

/** Reset all counters — for tests only. */
export function __resetRateLimits(): void {
  store.clear();
}
