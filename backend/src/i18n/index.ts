import type { ZodIssue } from "zod";
import { en } from "./en";
import { pt } from "./pt";
import { es } from "./es";

export type Locale = "en" | "pt" | "es";
export const LOCALES: Locale[] = ["en", "pt", "es"];
export const DEFAULT_LOCALE: Locale = "pt";

const catalogs = { en, pt, es } as const;

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as string[]).includes(v);
}

/** Resolve a dotted key like "errors.auth.invalidCredentials" against a catalog. */
function resolveKey(locale: Locale, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = catalogs[locale];
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as object)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    return v === undefined ? match : String(v);
  });
}

/**
 * Translate a dotted key for the given locale, interpolating {vars}.
 * Falls back to the default locale, then to the raw key, so a missing key
 * never throws.
 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const template =
    resolveKey(locale, key) ?? resolveKey(DEFAULT_LOCALE, key) ?? key;
  return interpolate(template, vars);
}

/** Parse the best matching locale from X-Locale then Accept-Language. */
export function localeFromRequest(headers: {
  "x-locale"?: string | string[];
  "accept-language"?: string | string[];
}): Locale {
  const xLocaleRaw = headers["x-locale"];
  const xLocale = Array.isArray(xLocaleRaw) ? xLocaleRaw[0] : xLocaleRaw;
  if (xLocale) {
    const lc = xLocale.trim().toLowerCase().slice(0, 2);
    if (isLocale(lc)) return lc;
  }

  const alRaw = headers["accept-language"];
  const al = Array.isArray(alRaw) ? alRaw[0] : alRaw;
  if (al) {
    // e.g. "pt-BR,pt;q=0.9,en;q=0.8"
    const langs = al
      .split(",")
      .map((part) => {
        const [tag, qPart] = part.trim().split(";");
        const q = qPart ? Number.parseFloat(qPart.replace("q=", "")) : 1;
        return { tag: tag.toLowerCase().slice(0, 2), q: Number.isFinite(q) ? q : 1 };
      })
      .sort((a, b) => b.q - a.q);
    for (const { tag } of langs) {
      if (isLocale(tag)) return tag;
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Localize a single Zod issue into a human message. Generic per-type messages
 * so we never leak internal Zod English when X-Locale is es/pt.
 */
export function zodIssueMessage(locale: Locale, issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.received === "undefined" || issue.received === "null") {
        return pickRequired(locale);
      }
      return pickInvalid(locale);
    case "too_small": {
      const min = issue.minimum;
      if (issue.type === "string") {
        return interpolate(pickMinLen(locale), { min: String(min) });
      }
      return interpolate(pickMin(locale), { min: String(min) });
    }
    case "too_big": {
      const max = issue.maximum;
      if (issue.type === "string") {
        return interpolate(pickMaxLen(locale), { max: String(max) });
      }
      return interpolate(pickMax(locale), { max: String(max) });
    }
    case "invalid_string":
      if (issue.validation === "email") return pickEmail(locale);
      return pickInvalid(locale);
    case "invalid_enum_value":
      return pickInvalid(locale);
    default:
      return pickInvalid(locale);
  }
}

// Small inline phrase tables (kept here so they don't bloat the main catalogs).
const phrases: Record<Locale, Record<string, string>> = {
  en: {
    required: "This field is required.",
    invalid: "This value is invalid.",
    minLen: "Must be at least {min} characters.",
    maxLen: "Must be at most {max} characters.",
    min: "Must be at least {min}.",
    max: "Must be at most {max}.",
    email: "Enter a valid email address.",
  },
  pt: {
    required: "Este campo é obrigatório.",
    invalid: "Este valor é inválido.",
    minLen: "Deve ter pelo menos {min} caracteres.",
    maxLen: "Deve ter no máximo {max} caracteres.",
    min: "Deve ser pelo menos {min}.",
    max: "Deve ser no máximo {max}.",
    email: "Informe um e-mail válido.",
  },
  es: {
    required: "Este campo es obligatorio.",
    invalid: "Este valor no es válido.",
    minLen: "Debe tener al menos {min} caracteres.",
    maxLen: "Debe tener como máximo {max} caracteres.",
    min: "Debe ser al menos {min}.",
    max: "Debe ser como máximo {max}.",
    email: "Introduce un correo válido.",
  },
};

const pickRequired = (l: Locale) => phrases[l].required;
const pickInvalid = (l: Locale) => phrases[l].invalid;
const pickMinLen = (l: Locale) => phrases[l].minLen;
const pickMaxLen = (l: Locale) => phrases[l].maxLen;
const pickMin = (l: Locale) => phrases[l].min;
const pickMax = (l: Locale) => phrases[l].max;
const pickEmail = (l: Locale) => phrases[l].email;
