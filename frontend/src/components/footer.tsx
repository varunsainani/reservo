"use client";

import { useTranslations } from "next-intl";
import { Logo } from "./logo";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-subtle">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
        </div>
        <p>
          © {year} Reservo · {t("tagline")}
        </p>
      </div>
    </footer>
  );
}
