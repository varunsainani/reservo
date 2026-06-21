"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarCheck, CreditCard, Zap } from "lucide-react";
import { Logo } from "./logo";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";

/** Split-screen auth chrome: a branded aside + the form, both with toggles. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("home");
  const tf = useTranslations("footer");

  const points = [
    { icon: Zap, text: t("heroBadge") },
    { icon: CreditCard, text: t("feature2Title") },
    { icon: CalendarCheck, text: t("feature3Title") },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Aside (hidden on small screens) */}
      <aside className="relative hidden w-1/2 flex-col justify-between bg-gradient-to-br from-primary to-accent-foreground p-10 text-primary-foreground lg:flex">
        <Link href="/" className="inline-flex">
          <Logo className="[&_span]:text-white [&>div]:bg-white/15" />
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">{t("heroTitle")}</h2>
          <p className="mt-3 text-sm text-white/80">{t("heroSubtitle")}</p>
          <ul className="mt-8 space-y-3">
            {points.map((p, i) => {
              const Icon = p.icon;
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  {p.text}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-xs text-white/60">© {new Date().getFullYear()} Reservo · {tf("tagline")}</p>
      </aside>

      {/* Form side */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-5">
          <Link href="/" className="lg:hidden">
            <Logo />
          </Link>
          <span className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-5 pb-12">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
