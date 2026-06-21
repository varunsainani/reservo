"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth, homeForRole } from "./auth-context";
import { LoadingState } from "./states";
import type { Role } from "@/lib/api-types";

/**
 * Gate a page on an authenticated user with one of `allow` roles. While the
 * session resolves we render a spinner; an unauthenticated user is bounced to
 * /login (preserving the intended path), a wrong-role user to their own home.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("common");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const next =
        typeof window !== "undefined"
          ? encodeURIComponent(window.location.pathname + window.location.search)
          : "";
      router.replace(`/login${next ? `?next=${next}` : ""}`);
      return;
    }
    if (!allow.includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
  }, [user, loading, allow, router]);

  if (loading || !user || !allow.includes(user.role)) {
    return <LoadingState label={t("checkingAccess")} />;
  }
  return <>{children}</>;
}
