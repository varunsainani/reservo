"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { User, Briefcase, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Spinner, useErrorMessage } from "./states";
import { useAuth, homeForRole } from "./auth-context";
import { DEMO } from "@/lib/api";

type Which = "customer" | "provider" | "admin";

export function DemoButtons() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const errMsg = useErrorMessage();
  const [busy, setBusy] = useState<Which | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configured =
    DEMO.customer.email && DEMO.provider.email && DEMO.admin.email;

  async function enter(which: Which) {
    setError(null);
    setBusy(which);
    try {
      const creds = DEMO[which];
      const user = await login(creds.email, creds.password);
      const next = params.get("next");
      router.push(next || homeForRole(user.role));
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
    }
  }

  if (!configured) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
        {t("demoUnavailable")}
      </p>
    );
  }

  const options: { which: Which; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { which: "customer", label: t("demoCustomer"), icon: User },
    { which: "provider", label: t("demoProvider"), icon: Briefcase },
    { which: "admin", label: t("demoAdmin"), icon: ShieldCheck },
  ];

  return (
    <div className="space-y-2">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <Button
            key={o.which}
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={!!busy}
            onClick={() => enter(o.which)}
          >
            {busy === o.which ? <Spinner /> : <Icon className="h-4 w-4" />}
            {o.label}
          </Button>
        );
      })}
      {error && <p className="text-center text-xs text-danger">{error}</p>}
    </div>
  );
}
