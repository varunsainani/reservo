import { env } from "../lib/env";
import type { PaymentProvider } from "./types";
import { SimulatedProvider } from "./simulated";
import { MercadoPagoProvider } from "./mercadopago";

let cached: PaymentProvider | null = null;

/** Active payment provider, chosen by PAYMENT_PROVIDER env (singleton). */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  cached =
    env.PAYMENT_PROVIDER === "mercadopago"
      ? new MercadoPagoProvider()
      : new SimulatedProvider();
  return cached;
}

export * from "./types";
