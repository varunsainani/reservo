import type { Request } from "express";
import type {
  Booking,
  Payment,
  PaymentMethod,
  PaymentProviderType,
  PaymentStatus,
} from "@prisma/client";

export interface CheckoutResult {
  checkoutUrl: string;
  pixQr?: string | null;
  externalId: string;
}

export interface VerifiedWebhook {
  externalId: string;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  type: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly kind: PaymentProviderType;
  /** Create the checkout for a freshly-created PENDING booking + payment. */
  createCheckout(booking: Booking, payment: Payment): Promise<CheckoutResult>;
  /**
   * Verify an incoming webhook request (signature/token), returning the parsed
   * event. Throws { authError: true } when the signature/token is invalid so the
   * route can reply 401. Returns null when the payload is irrelevant/unparseable
   * (route replies 200, no-op).
   */
  verifyWebhook(req: Request): Promise<VerifiedWebhook | null>;
}

export class WebhookAuthError extends Error {
  authError = true as const;
  constructor(message = "Invalid webhook signature/token") {
    super(message);
    this.name = "WebhookAuthError";
  }
}
