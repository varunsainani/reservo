"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, ArrowRight } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { categoryKey } from "@/lib/categories";
import { initials } from "@/lib/utils";
import { useFormat } from "@/lib/format";
import type { ProviderCard as ProviderCardType } from "@/lib/api-types";

export function ProviderCard({ provider }: { provider: ProviderCardType }) {
  const t = useTranslations();
  const fmt = useFormat();
  const location = [provider.city, provider.region].filter(Boolean).join(", ");

  return (
    <Link href={`/p/${provider.slug}`} className="group block">
      <Card className="h-full p-5 transition-colors hover:border-primary/40 hover:bg-subtle">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-sm font-semibold text-primary">
            {provider.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={provider.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(provider.name)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-semibold tracking-tight text-foreground">
                {provider.name}
              </h3>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="info">{t(`categories.${categoryKey(provider.category)}`)}</Badge>
              {location && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {location}
                </span>
              )}
            </div>
          </div>
        </div>
        {provider.bio && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{provider.bio}</p>
        )}
        <div className="mt-3 flex items-center justify-between text-sm">
          {typeof provider.serviceCount === "number" && (
            <span className="text-muted-foreground">
              {t("admin.services")}: {provider.serviceCount}
            </span>
          )}
          {typeof provider.priceFromCents === "number" && provider.priceFromCents > 0 && (
            <span className="font-medium text-foreground">
              {t("common.from")}{" "}
              {fmt.money(provider.priceFromCents, provider.currency || "BRL")}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
