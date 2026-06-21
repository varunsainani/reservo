"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  LayoutDashboard,
  Clock,
  Scissors,
  ShieldCheck,
  Users,
  CalendarRange,
  LogOut,
  Menu,
  X,
  Ticket,
} from "lucide-react";
import { Logo } from "./logo";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { useAuth } from "./auth-context";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  // Role-aware primary links.
  let links: NavLink[] = [];
  if (!user) {
    links = [{ href: "/", label: t("browse"), icon: CalendarDays }];
  } else if (user.role === "CUSTOMER") {
    links = [
      { href: "/", label: t("browse"), icon: CalendarDays },
      { href: "/my-bookings", label: t("myBookings"), icon: Ticket },
    ];
  } else if (user.role === "PROVIDER") {
    links = [
      { href: "/dashboard", label: t("overview"), icon: LayoutDashboard },
      { href: "/dashboard/calendar", label: t("calendar"), icon: CalendarRange },
      { href: "/dashboard/services", label: t("services"), icon: Scissors },
      { href: "/dashboard/availability", label: t("availability"), icon: Clock },
    ];
  } else if (user.role === "ADMIN") {
    links = [
      { href: "/admin", label: t("overview"), icon: ShieldCheck },
      { href: "/admin/bookings", label: t("bookings"), icon: CalendarDays },
      { href: "/admin/providers", label: t("providers"), icon: Users },
    ];
  }

  const homeHref = user
    ? user.role === "PROVIDER"
      ? "/dashboard"
      : user.role === "ADMIN"
        ? "/admin"
        : "/"
    : "/";

  function isActive(href: string) {
    if (href === "/" || href === "/dashboard" || href === "/admin") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href={homeHref} className="shrink-0" aria-label="Reservo">
          <Logo />
        </Link>

        {/* Desktop links */}
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive(l.href)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageToggle />
          </div>
          <ThemeToggle />

          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                title={user.name}
              >
                {initials(user.name)}
              </div>
              <Button variant="ghost" size="icon" aria-label={t("logout")} onClick={() => logout()}>
                <LogOut className="h-[18px] w-[18px]" />
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  {t("login")}
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">{t("getStarted")}</Button>
              </Link>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label={t("menu")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive(l.href)
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
            <div className="my-2 h-px bg-border" />
            <div className="flex items-center justify-between px-1">
              <LanguageToggle />
              {user ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  {t("logout")}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Link href="/login" onClick={() => setOpen(false)}>
                    <Button variant="ghost" size="sm">
                      {t("login")}
                    </Button>
                  </Link>
                  <Link href="/register" onClick={() => setOpen(false)}>
                    <Button size="sm">{t("getStarted")}</Button>
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
