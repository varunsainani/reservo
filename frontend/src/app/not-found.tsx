import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-24 text-center">
        <p className="text-5xl font-semibold tracking-tight text-primary">404</p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("body")}</p>
        <Link href="/" className="mt-6">
          <Button>{t("home")}</Button>
        </Link>
      </div>
    </AppShell>
  );
}
