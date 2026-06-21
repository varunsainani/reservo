"use server";

import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "./config";

const COOKIE = "NEXT_LOCALE";

export async function getUserLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  // Auto-detect from the browser's Accept-Language on first visit.
  const accept = (await headers()).get("accept-language") || "";
  const preferred = accept
    .split(",")
    .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase())
    .find((lang) => isLocale(lang));

  return isLocale(preferred) ? preferred : defaultLocale;
}

export async function setUserLocale(locale: Locale) {
  (await cookies()).set(COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
