import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MapPin, Clock } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BookingWidget } from "@/components/booking-widget";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProviderServicePrice } from "@/components/provider-service-price";
import { fetchProvider } from "@/lib/server-api";
import { categoryKey } from "@/lib/categories";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const provider = await fetchProvider(slug);
  if (!provider) return { title: "Reservo", robots: { index: false } };
  return {
    title: provider.name,
    description: provider.bio || undefined,
  };
}

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("provider");
  const tCat = await getTranslations("categories");
  const provider = await fetchProvider(slug);

  // Missing record → 404 (no slug echoed). A null from a DOWN backend also lands
  // here; that's acceptable since the page genuinely can't render without data.
  if (!provider) notFound();

  const location = [provider.city, provider.region, provider.country]
    .filter(Boolean)
    .join(", ");
  const activeServices = provider.services.filter((s) => s.active);

  return (
    <AppShell>
      <div className="border-b border-border bg-gradient-to-b from-accent/30 to-background">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
              {provider.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={provider.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(provider.name)
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{provider.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="info">{tCat(categoryKey(provider.category))}</Badge>
                {location && (
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {provider.timezone}
                </span>
              </div>
              {provider.bio && (
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{provider.bio}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_minmax(360px,420px)]">
        {/* Services list */}
        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">{t("servicesTitle")}</h2>
          {activeServices.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-subtle p-6 text-center text-sm text-muted-foreground">
              {t("noServices")}
            </p>
          ) : (
            <div className="space-y-3">
              {activeServices.map((s) => (
                <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{s.name}</p>
                    {s.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {t("minutes", { count: s.durationMin })}
                    </p>
                  </div>
                  <ProviderServicePrice priceCents={s.priceCents} currency={s.currency} />
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Booking widget */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold tracking-tight">{t("bookTitle")}</h2>
            <BookingWidget provider={provider} />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
