import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeBookingPublic } from "../lib/serialize";

/**
 * GET /api/me/bookings-customer (role CUSTOMER)
 * The logged-in customer's bookings, matched by linked customerId OR by the
 * email on their account, so bookings made before/while logged out still show.
 */
export async function listCustomerBookings(
  req: Request,
  res: Response
): Promise<void> {
  const where: Prisma.BookingWhereInput = {
    OR: [
      { customerId: req.auth!.userId },
      { customerEmail: req.auth!.email },
    ],
  };

  const bookings = await prisma.booking.findMany({
    where,
    include: { service: true, provider: true, payment: true },
    orderBy: { startsAt: "desc" },
    take: 200,
  });

  res.status(200).json({ items: bookings.map(serializeBookingPublic) });
}
