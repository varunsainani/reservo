export const locales = ["en", "pt", "es"] as const;
export type Locale = (typeof locales)[number];

// Default is PT: Pix/MercadoPago and the demo are Brazil-first.
export const defaultLocale: Locale = "pt";

export const localeNames: Record<Locale, string> = {
  en: "English",
  pt: "Português",
  es: "Español",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
