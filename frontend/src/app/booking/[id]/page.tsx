import type { Metadata } from "next";
import { BookingClient } from "./booking-client";

export const dynamic = "force-dynamic";

// Private, tokenised page — never index or follow.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BookingStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  return <BookingClient id={id} token={token ?? ""} />;
}
