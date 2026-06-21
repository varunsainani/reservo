import type { Metadata } from "next";
import { CheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";

// Private, tokenised page — never index or follow.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  return <CheckoutClient id={id} token={token ?? ""} />;
}
