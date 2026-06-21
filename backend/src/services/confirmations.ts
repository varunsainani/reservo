import { DateTime } from "luxon";
import type { Booking, Provider, Service } from "@prisma/client";
import { env } from "../lib/env";
import { t, type Locale } from "../i18n";

export interface ConfirmationContext {
  booking: Pick<Booking, "startsAt" | "customerName" | "customerEmail">;
  provider: Pick<Provider, "name" | "whatsapp" | "timezone">;
  service: Pick<Service, "name">;
  locale: Locale;
}

function formatParts(ctx: ConfirmationContext): {
  date: string;
  time: string;
} {
  const dt = DateTime.fromJSDate(ctx.booking.startsAt, { zone: "utc" }).setZone(
    ctx.provider.timezone
  );
  const localeTag =
    ctx.locale === "pt" ? "pt-BR" : ctx.locale === "es" ? "es-ES" : "en-US";
  return {
    date: dt.setLocale(localeTag).toLocaleString(DateTime.DATE_FULL),
    time: dt.setLocale(localeTag).toLocaleString(DateTime.TIME_SIMPLE),
  };
}

/** Build the wa.me deep link surfaced on the receipt (returns null if no phone). */
export function buildWhatsappLink(ctx: ConfirmationContext): string | null {
  const phone = (ctx.provider.whatsapp ?? "").replace(/[^\d]/g, "");
  if (!phone) return null;
  const { date, time } = formatParts(ctx);
  const text = t(ctx.locale, "confirmation.waText", {
    service: ctx.service.name,
    provider: ctx.provider.name,
    date,
    time,
  });
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Fire the confirmation side-effects after a booking is CONFIRMED. The in-app
 * record IS the booking + AuditLog (written by the caller in-transaction). Here
 * we send the optional email if creds are present; otherwise skip silently.
 * Never throws into the caller.
 */
export async function sendConfirmation(ctx: ConfirmationContext): Promise<void> {
  try {
    const emailConfigured =
      (!!env.BREVO_API_KEY && !!env.BREVO_SENDER_EMAIL) ||
      (!!env.SMTP_HOST && !!env.SMTP_USER);
    if (!emailConfigured) return; // No creds → skip silently (no crash).

    const { date, time } = formatParts(ctx);
    const subject = t(ctx.locale, "confirmation.subject", {
      provider: ctx.provider.name,
    });
    const body = t(ctx.locale, "confirmation.body", {
      service: ctx.service.name,
      provider: ctx.provider.name,
      date,
      time,
    });

    if (env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL) {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: env.BREVO_SENDER_EMAIL,
            name: env.BREVO_SENDER_NAME || "Reservo",
          },
          to: [{ email: ctx.booking.customerEmail, name: ctx.booking.customerName }],
          subject,
          htmlContent: `<p>${body}</p>`,
        }),
      }).catch(() => undefined);
    }
    // SMTP path intentionally omitted (no nodemailer dep); Brevo HTTP covers the
    // optional-email requirement without socket infra.
  } catch {
    // Confirmation email must never break the confirm transaction's success.
  }
}
