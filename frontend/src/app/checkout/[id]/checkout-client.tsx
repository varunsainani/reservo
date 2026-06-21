"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, Check, ShieldCheck, Lock, Info } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState, Spinner, useErrorMessage } from "@/components/states";
import { PixQrMock } from "@/components/pix-qr";
import { getBooking, simulatePayment } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { BookingPublic } from "@/lib/api-types";

export function CheckoutClient({ id, token }: { id: string; token: string }) {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [booking, setBooking] = useState<BookingPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<null | "approved" | "rejected">(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await getBooking(id, token);
      setBooking(b);
    } catch (e) {
      setError(errMsg(e));
      setBooking(null);
    } finally {
      setLoading(false);
    }
  }, [id, token, errMsg]);

  useEffect(() => {
    if (!token) {
      setError(t("notFoundBody"));
      setLoading(false);
      return;
    }
    load();
  }, [load, token, t]);

  async function pay(outcome: "approved" | "rejected") {
    setPaying(outcome);
    try {
      await simulatePayment({ bookingId: id, token, outcome });
      // Both outcomes route to the live-confirm page, which reflects the result.
      router.push(`/booking/${id}?token=${encodeURIComponent(token)}`);
    } catch (e) {
      setError(errMsg(e));
      setPaying(null);
    }
  }

  const pixCode =
    booking?.publicToken && booking?.priceCents
      ? // Mock copy-and-paste payload; the backend's real pixQr is shown via the QR.
        `00020126360014BR.GOV.BCB.PIX0114reservo-${booking.publicToken.slice(0, 12)}5204000053039865802BR5909Reservo`
      : "";

  function copyPix() {
    if (!pixCode) return;
    navigator.clipboard?.writeText(pixCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        {loading ? (
          <LoadingState />
        ) : error || !booking ? (
          <Card className="p-8 text-center">
            <h1 className="text-lg font-semibold tracking-tight">{t("notFoundTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error || t("notFoundBody")}</p>
            {token && (
              <Button className="mt-5" variant="outline" onClick={load}>
                {tCommon("retry")}
              </Button>
            )}
          </Card>
        ) : booking.status !== "PENDING_PAYMENT" ? (
          // Already paid / cancelled / expired: don't show the pay buttons.
          <Card className="p-8 text-center">
            <h1 className="text-lg font-semibold tracking-tight">{t("alreadyPaidTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("alreadyPaidBody")}</p>
            <Button
              className="mt-5"
              onClick={() => router.push(`/booking/${id}?token=${encodeURIComponent(token)}`)}
            >
              {t("goToBooking")}
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>

            <Card className="overflow-hidden">
              {/* Amount */}
              <div className="border-b border-border bg-subtle p-5 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("amount")}
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                  {fmt.money(booking.priceCents, booking.currency)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {booking.service.name} · {fmt.inTz(booking.startsAt, booking.provider.timezone)}
                </p>
              </div>

              {/* Pix */}
              <div className="p-5">
                <p className="text-sm font-medium text-foreground">{t("pixTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("pixHint")}</p>
                <div className="mt-4 flex flex-col items-center gap-4">
                  <PixQrMock value={booking.publicToken} />
                  <div className="w-full">
                    <p className="mb-1 text-xs text-muted-foreground">{t("pixCode")}</p>
                    <div className="flex items-stretch gap-2">
                      <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                        {pixCode}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="copy"
                        onClick={copyPix}
                      >
                        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 border-t border-border p-5">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!!paying}
                  onClick={() => pay("approved")}
                >
                  {paying === "approved" ? (
                    <>
                      <Spinner className="text-primary-foreground" />
                      {t("processing")}
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      {t("payNow")}
                    </>
                  )}
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!!paying}
                  onClick={() => pay("rejected")}
                >
                  {paying === "rejected" ? <Spinner /> : t("simulateRejection")}
                </Button>
                <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("secured")} · {t("expiresHint")}
                </p>
              </div>
            </Card>

            <p className="mt-4 flex items-start gap-2 rounded-lg bg-accent/50 px-3 py-2 text-xs text-accent-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("demoNote")}
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
