"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Inline spinner. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

/** A centered loading block for data fetches. */
export function LoadingState({ label }: { label?: string }) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm">{label ?? t("loading")}</p>
    </div>
  );
}

/**
 * Localize an unknown error. Backend ApiError.message is already localized by
 * the server (via X-Locale); for client/network failures fall back to an i18n
 * key so the user never sees a raw English/technical string.
 */
export function useErrorMessage() {
  const t = useTranslations("errors");
  // Memoized so the returned function has a stable identity across renders.
  // Without this, any caller that puts it in a useCallback/useEffect dependency
  // array (e.g. the checkout loader) re-runs every render and loops forever.
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError) {
        if (err.code === "NETWORK" || err.status === 0) return t("network");
        // The backend localizes error.message; show it. Guard against a bare
        // machine code leaking through.
        if (err.message && !/^[a-z_]+$/.test(err.message)) return err.message;
        if (err.code) return t.has(`code.${err.code}`) ? t(`code.${err.code}`) : t("generic");
        return t("generic");
      }
      if (err instanceof Error && err.message) return err.message;
      return t("generic");
    },
    [t],
  );
}

/** A centered error block with an optional retry. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

/** A centered empty block. */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
