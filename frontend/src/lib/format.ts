"use client";

import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/config";

// Map our app locales to fuller BCP-47 tags so Intl picks the right regional
// formatting (e.g. pt → pt-BR for R$ and dd/mm/yyyy).
const INTL_LOCALE: Record<Locale, string> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-AR",
};

/** Format integer cents in the given ISO currency, locale-aware. */
export function formatMoney(cents: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** A booking/slot time rendered in the provider's IANA timezone. */
export function formatInTz(
  iso: string,
  timezone: string,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      ...opts,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Just the HH:mm of a slot in the provider's timezone. */
export function formatTimeInTz(iso: string, timezone: string, locale: Locale): string {
  return formatInTz(iso, timezone, locale, { hour: "2-digit", minute: "2-digit" });
}

/** A day label (no time) in the provider's timezone. */
export function formatDayInTz(iso: string, timezone: string, locale: Locale): string {
  return formatInTz(iso, timezone, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** React hook bundling the active-locale formatters. */
export function useFormat() {
  const locale = useLocale() as Locale;
  return {
    locale,
    money: (cents: number, currency: string) => formatMoney(cents, currency, locale),
    inTz: (iso: string, tz: string, opts?: Intl.DateTimeFormatOptions) =>
      formatInTz(iso, tz, locale, opts),
    timeInTz: (iso: string, tz: string) => formatTimeInTz(iso, tz, locale),
    dayInTz: (iso: string, tz: string) => formatDayInTz(iso, tz, locale),
    // Local-time fallback when no provider tz is relevant (e.g. createdAt).
    dateTime: (iso: string) =>
      new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso)),
    date: (iso: string) =>
      new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(iso)),
  };
}
