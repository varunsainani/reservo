import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, CreditCard, CalendarCheck, Zap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { HomeBrowse } from "@/components/home-browse";
import { Button } from "@/components/ui/button";
import { fetchProviders } from "@/lib/server-api";

// Always render at request time so a missing backend never breaks a build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslations("home");

  // Server-seed the listing; degrades to an empty/offline state on failure.
  const data = await fetchProviders({ pageSize: 24 });
  const items = data?.items ?? [];
  const facets = data?.facets?.categories ?? [];
  const offline = data === null;

  const features = [
    { icon: CalendarClock, title: t("feature1Title"), body: t("feature1Body") },
    { icon: CreditCard, title: t("feature2Title"), body: t("feature2Body") },
    { icon: CalendarCheck, title: t("feature3Title"), body: t("feature3Body") },
  ];
  const steps = [
    { n: 1, title: t("step1Title"), body: t("step1Body") },
    { n: 2, title: t("step2Title"), body: t("step2Body") },
    { n: 3, title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-accent/40 to-background">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Zap className="h-3.5 w-3.5" />
              {t("heroBadge")}
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {t("heroTitle")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              {t("heroSubtitle")}
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="#browse">
                <Button size="lg">{t("heroCtaBrowse")}</Button>
              </Link>
              <Link href="/register">
                <Button size="lg" variant="outline">
                  {t("heroCtaProvider")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">{t("howTitle")}</h2>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-xl border border-border bg-card p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border bg-subtle">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">{t("featuresTitle")}</h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="rounded-xl border border-border bg-card p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Browse */}
      <section id="browse" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14 sm:px-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t("browseTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("browseSubtitle")}</p>
        </div>
        <HomeBrowse initialItems={items} initialFacets={facets} initialError={offline} />
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-accent/50 to-card p-8 text-center sm:p-12">
            <h2 className="text-2xl font-semibold tracking-tight">{t("ctaTitle")}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{t("ctaBody")}</p>
            <Link href="/register" className="mt-6 inline-block">
              <Button size="lg">{t("ctaButton")}</Button>
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
