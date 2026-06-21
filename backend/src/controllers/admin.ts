import type { Request, Response } from "express";
import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { httpError } from "../lib/http-error";
import { audit } from "../lib/audit";
import { serializeBookingAdmin } from "../lib/serialize";
import { parsePagination, parseStr, parseBookingStatus } from "../lib/query";
import { adminBookingActionSchema } from "../lib/validation";

// GET /api/admin/overview
export async function overview(_req: Request, res: Response): Promise<void> {
  const [
    providers,
    total,
    confirmed,
    pending,
    cancelled,
    expired,
    revenue,
    recent,
    topGroups,
  ] = await Promise.all([
    prisma.provider.count(),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
    prisma.booking.count({ where: { status: BookingStatus.PENDING_PAYMENT } }),
    prisma.booking.count({ where: { status: BookingStatus.CANCELLED } }),
    prisma.booking.count({ where: { status: BookingStatus.EXPIRED } }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: PaymentStatus.APPROVED },
    }),
    prisma.booking.findMany({
      include: { service: true, provider: true, payment: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.booking.groupBy({
      by: ["providerId"],
      where: { status: BookingStatus.CONFIRMED },
      _count: { _all: true },
    }),
  ]);

  // Resolve top providers (by confirmed bookings) + their approved revenue.
  const sortedTop = topGroups
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 5);
  const topProviderIds = sortedTop.map((g) => g.providerId);
  const [topProviders, topRevenue] = await Promise.all([
    prisma.provider.findMany({
      where: { id: { in: topProviderIds } },
      select: { id: true, name: true, slug: true, category: true },
    }),
    prisma.payment.groupBy({
      by: ["bookingId"],
      where: {
        status: PaymentStatus.APPROVED,
        booking: { providerId: { in: topProviderIds } },
      },
      _sum: { amountCents: true },
    }),
  ]);

  // Map approved revenue per provider.
  const revenueByBooking = new Map(
    topRevenue.map((r) => [r.bookingId, r._sum.amountCents ?? 0])
  );
  const bookingsForTop = topProviderIds.length
    ? await prisma.booking.findMany({
        where: {
          providerId: { in: topProviderIds },
          payment: { status: PaymentStatus.APPROVED },
        },
        select: { id: true, providerId: true },
      })
    : [];
  const revByProvider = new Map<string, number>();
  for (const b of bookingsForTop) {
    revByProvider.set(
      b.providerId,
      (revByProvider.get(b.providerId) ?? 0) + (revenueByBooking.get(b.id) ?? 0)
    );
  }

  const providerById = new Map(topProviders.map((p) => [p.id, p]));

  res.status(200).json({
    providers,
    bookings: { total, confirmed, pending, cancelled, expired },
    revenueCents: revenue._sum.amountCents ?? 0,
    recentBookings: recent.map(serializeBookingAdmin),
    topProviders: sortedTop.map((g) => {
      const p = providerById.get(g.providerId);
      return {
        id: g.providerId,
        name: p?.name ?? "",
        slug: p?.slug ?? "",
        category: p?.category ?? "",
        confirmedCount: g._count._all,
        revenueCents: revByProvider.get(g.providerId) ?? 0,
      };
    }),
  });
}

// GET /api/admin/bookings
export async function listBookings(req: Request, res: Response): Promise<void> {
  const { page, pageSize, skip, take } = parsePagination(
    req.query as Record<string, unknown>
  );
  const status = parseBookingStatus(req.query.status);
  const providerId = parseStr(req.query.providerId);

  const where: Prisma.BookingWhereInput = {};
  if (status) where.status = status;
  if (providerId) where.providerId = providerId;

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: { service: true, provider: true, payment: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);

  res.status(200).json({
    items: bookings.map(serializeBookingAdmin),
    total,
    page,
    pageSize,
  });
}

// PATCH /api/admin/bookings/:id  { action: "cancel" | "refund" }
export async function patchBooking(req: Request, res: Response): Promise<void> {
  const body = adminBookingActionSchema.parse(req.body);
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { payment: true },
  });
  if (!booking) {
    throw httpError(404, "errors.booking.bookingNotFound", {
      code: "BOOKING_NOT_FOUND",
    });
  }

  if (body.action === "cancel") {
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.EXPIRED ||
      booking.status === BookingStatus.REFUNDED
    ) {
      throw httpError(409, "errors.booking.notCancellable", {
        code: "NOT_CANCELLABLE",
      });
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED, holdExpiresAt: null },
      include: { service: true, provider: true, payment: true },
    });
    await audit("booking.cancelled", {
      actorId: req.auth!.userId,
      meta: { bookingId: booking.id, by: "admin" },
    });
    res.status(200).json(serializeBookingAdmin(updated));
    return;
  }

  // refund — only a CONFIRMED booking is refundable.
  if (booking.status !== BookingStatus.CONFIRMED) {
    throw httpError(409, "errors.booking.invalidAction", {
      code: "NOT_REFUNDABLE",
    });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.REFUNDED },
      include: { service: true, provider: true, payment: true },
    });
    if (booking.payment) {
      await tx.payment.update({
        where: { id: booking.payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
    }
    await audit("booking.refunded", {
      actorId: req.auth!.userId,
      meta: { bookingId: booking.id },
      db: tx,
    });
    return b;
  });
  res.status(200).json(serializeBookingAdmin(updated));
}

// GET /api/admin/providers
export async function listProvidersAdmin(
  req: Request,
  res: Response
): Promise<void> {
  const { page, pageSize, skip, take } = parsePagination(
    req.query as Record<string, unknown>
  );

  const [total, providers] = await Promise.all([
    prisma.provider.count(),
    prisma.provider.findMany({
      include: {
        user: { select: { email: true } },
        _count: { select: { bookings: true, services: true } },
      },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
  ]);

  const items = await Promise.all(
    providers.map(async (p) => {
      const revenue = await prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: {
          status: PaymentStatus.APPROVED,
          booking: { providerId: p.id },
        },
      });
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        category: p.category,
        city: p.city,
        region: p.region,
        country: p.country,
        timezone: p.timezone,
        ownerEmail: p.user.email,
        bookingCount: p._count.bookings,
        serviceCount: p._count.services,
        revenueCents: revenue._sum.amountCents ?? 0,
        createdAt: p.createdAt.toISOString(),
      };
    })
  );

  res.status(200).json({ items, total, page, pageSize });
}
