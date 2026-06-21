import { BookingClient } from "./booking-client";

export const dynamic = "force-dynamic";

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
