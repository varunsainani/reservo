export const SUPPORTED_CURRENCIES = ["BRL", "ARS", "MXN", "USD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

const localeForCurrency: Record<Currency, string> = {
  BRL: "pt-BR",
  ARS: "es-AR",
  MXN: "es-MX",
  USD: "en-US",
};

/** Format integer cents as a localized currency string (best-effort). */
export function formatMoney(cents: number, currency: string): string {
  const cur = isCurrency(currency) ? currency : "BRL";
  try {
    return new Intl.NumberFormat(localeForCurrency[cur], {
      style: "currency",
      currency: cur,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}
