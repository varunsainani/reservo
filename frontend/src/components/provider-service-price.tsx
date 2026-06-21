"use client";

import { useFormat } from "@/lib/format";

/** Client-side price rendering so server pages get locale-correct currency. */
export function ProviderServicePrice({
  priceCents,
  currency,
}: {
  priceCents: number;
  currency: string;
}) {
  const fmt = useFormat();
  return (
    <span className="shrink-0 text-right font-semibold text-foreground">
      {fmt.money(priceCents, currency)}
    </span>
  );
}
