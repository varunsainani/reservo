"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { User, Briefcase } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DemoButtons } from "@/components/demo-buttons";
import { Spinner, useErrorMessage, LoadingState } from "@/components/states";
import { useAuth, homeForRole } from "@/components/auth-context";
import { cn } from "@/lib/utils";

type Role = "CUSTOMER" | "PROVIDER";

function RegisterForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const { register, user, loading } = useAuth();
  const errMsg = useErrorMessage();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CUSTOMER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && user) {
      const next = params.get("next");
      router.replace(next || homeForRole(user.role));
    }
  }, [loading, user, params, router]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("validationName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = t("validationEmail");
    if (password.length < 8) errs.password = t("validationPassword");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const u = await register({ name: name.trim(), email: email.trim(), password, role });
      const next = params.get("next");
      router.push(next || homeForRole(u.role));
    } catch (err) {
      setError(errMsg(err));
      setSubmitting(false);
    }
  }

  const roles: { value: Role; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "CUSTOMER", label: t("roleCustomer"), icon: User },
    { value: "PROVIDER", label: t("roleProvider"), icon: Briefcase },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("registerSubtitle")}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          {fieldErrors.name && <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>}
        </div>
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p>}
        </div>
        <div>
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {fieldErrors.password ? (
            <p className="mt-1 text-xs text-danger">{fieldErrors.password}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t("passwordHint")}</p>
          )}
        </div>
        <div>
          <Label>{t("accountType")}</Label>
          <div className="grid grid-cols-1 gap-2">
            {roles.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                    role === r.value
                      ? "border-primary bg-accent/60 ring-1 ring-primary/30"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner className="text-primary-foreground" />
              {t("registering")}
            </>
          ) : (
            t("registerButton")
          )}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{t("demoTitle")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <DemoButtons />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell>
      <Suspense fallback={<LoadingState />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
