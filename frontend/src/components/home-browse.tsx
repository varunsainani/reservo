"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input, Select } from "./ui/input";
import { ProviderCard } from "./provider-card";
import { LoadingState, ErrorState, EmptyState, useErrorMessage } from "./states";
import { listProviders } from "@/lib/api";
import { categoryKey, KNOWN_CATEGORIES } from "@/lib/categories";
import type { ProviderCard as ProviderCardType, FacetValue } from "@/lib/api-types";

export function HomeBrowse({
  initialItems,
  initialFacets,
  initialError,
}: {
  initialItems: ProviderCardType[];
  initialFacets: FacetValue[];
  initialError: boolean;
}) {
  const t = useTranslations("home");
  const tCat = useTranslations("categories");
  const errMsg = useErrorMessage();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<ProviderCardType[]>(initialItems);
  const [facets, setFacets] = useState<FacetValue[]>(initialFacets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? t("offlineBody") : null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  const load = useCallback(
    async (nextQ: string, nextCat: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listProviders({
          q: nextQ || undefined,
          category: nextCat || undefined,
          pageSize: 24,
        });
        setItems(data.items);
        if (data.facets?.categories) setFacets(data.facets.categories);
      } catch (e) {
        setError(errMsg(e));
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [errMsg],
  );

  // Debounced re-fetch on filter changes (skip the very first render — SSR seeded it).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(q, category), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, category, load]);

  // Build a de-duplicated category dropdown from known categories + facets.
  const categoryOptions = Array.from(
    new Set([...facets.map((f) => categoryKey(f.value)), ...KNOWN_CATEGORIES]),
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-11 pl-9"
            aria-label={t("searchPlaceholder")}
          />
        </div>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 sm:w-56"
          aria-label={t("categoryAll")}
        >
          <option value="">{t("categoryAll")}</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {tCat(c)}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-6">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(q, category)} />
        ) : items.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("resultsCount", { count: items.length })}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <ProviderCard key={p.id} provider={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
