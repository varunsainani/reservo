import type { Request, Response } from "express";
import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../lib/prisma";
import { httpError } from "../lib/http-error";
import { audit } from "../lib/audit";
import {
  serializeProviderDetail,
  serializeService,
  serializeAvailability,
  serializeTimeBlock,
  serializeBookingAdmin,
} from "../lib/serialize";
import { parseStr, parseBookingStatus } from "../lib/query";
import {
  serviceSchema,
  serviceUpdateSchema,
  updateProviderSchema,
  availabilitySchema,
  blockSchema,
  providerBookingActionSchema,
} from "../lib/validation";
import { validateSlot } from "../services/availability";

/** Load the Provider owned by the authenticated user, or 404. */
async function myProvider(req: Request) {
  const provider = await prisma.provider.findUnique({
    where: { userId: req.auth!.userId },
  });
  if (!provider) {
    throw httpError(404, "errors.provider.notFound", { code: "PROVIDER_NOT_FOUND" });
  }
  return provider;
}

// GET /api/me/provider
export async function getMyProvider(req: Request, res: Response): Promise<void> {
  const base = await myProvider(req);
  const full = await prisma.provider.findUnique({
    where: { id: base.id },
    include: {
      services: true,
      availabilityRules: true,
      timeBlocks: { orderBy: { startsAt: "asc" } },
    },
  });
  res.status(200).json(serializeProviderDetail(full!, { includePrivate: true }));
}

// PUT /api/me/provider
export async function updateMyProvider(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const body = updateProviderSchema.parse(req.body);

  if (!DateTime.local().setZone(body.timezone).isValid) {
    throw httpError(400, "errors.provider.invalidTimezone", {
      code: "INVALID_TIMEZONE",
    });
  }

  if (body.slug && body.slug !== provider.slug) {
    const taken = await prisma.provider.findUnique({
      where: { slug: body.slug },
      select: { id: true },
    });
    if (taken) {
      throw httpError(409, "errors.provider.slugTaken", { code: "SLUG_TAKEN" });
    }
  }

  const updated = await prisma.provider.update({
    where: { id: provider.id },
    data: {
      name: body.name,
      slug: body.slug ?? provider.slug,
      bio: body.bio,
      category: body.category,
      timezone: body.timezone,
      city: body.city,
      region: body.region,
      country: body.country,
      whatsapp: body.whatsapp ?? null,
      avatarUrl: body.avatarUrl ?? null,
    },
    include: {
      services: true,
      availabilityRules: true,
      timeBlocks: { orderBy: { startsAt: "asc" } },
    },
  });

  await audit("provider.updated", { actorId: req.auth!.userId, meta: { providerId: provider.id } });
  res.status(200).json(serializeProviderDetail(updated, { includePrivate: true }));
}

// GET /api/me/services
export async function listMyServices(req: Request, res: Response): Promise<void> {
  const provider = await myProvider(req);
  const services = await prisma.service.findMany({
    where: { providerId: provider.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.status(200).json({ items: services.map(serializeService) });
}

// POST /api/me/services
export async function createMyService(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const body = serviceSchema.parse(req.body);
  const service = await prisma.service.create({
    data: {
      providerId: provider.id,
      name: body.name,
      description: body.description ?? null,
      durationMin: body.durationMin,
      priceCents: body.priceCents,
      currency: body.currency,
      active: body.active,
      sortOrder: body.sortOrder,
    },
  });
  await audit("service.created", { actorId: req.auth!.userId, meta: { serviceId: service.id } });
  res.status(201).json(serializeService(service));
}

// PUT /api/me/services/:id
export async function updateMyService(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const body = serviceUpdateSchema.parse(req.body);
  const existing = await prisma.service.findFirst({
    where: { id: req.params.id, providerId: provider.id },
  });
  if (!existing) {
    throw httpError(404, "errors.provider.serviceNotFound", {
      code: "SERVICE_NOT_FOUND",
    });
  }
  const service = await prisma.service.update({
    where: { id: existing.id },
    data: {
      name: body.name ?? undefined,
      description: body.description === undefined ? undefined : body.description,
      durationMin: body.durationMin ?? undefined,
      priceCents: body.priceCents ?? undefined,
      currency: body.currency ?? undefined,
      active: body.active ?? undefined,
      sortOrder: body.sortOrder ?? undefined,
    },
  });
  res.status(200).json(serializeService(service));
}

// DELETE /api/me/services/:id
export async function deleteMyService(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const existing = await prisma.service.findFirst({
    where: { id: req.params.id, providerId: provider.id },
  });
  if (!existing) {
    throw httpError(404, "errors.provider.serviceNotFound", {
      code: "SERVICE_NOT_FOUND",
    });
  }
  try {
    await prisma.service.delete({ where: { id: existing.id } });
  } catch (e) {
    // If bookings reference it (onDelete: Restrict), soft-deactivate instead.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      await prisma.service.update({
        where: { id: existing.id },
        data: { active: false },
      });
      res.status(200).json({ ok: true, deactivated: true });
      return;
    }
    throw e;
  }
  res.status(200).json({ ok: true });
}

// GET /api/me/availability
export async function getMyAvailability(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const rules = await prisma.availabilityRule.findMany({
    where: { providerId: provider.id },
  });
  res.status(200).json(serializeAvailability(rules));
}

// PUT /api/me/availability (replace-all)
export async function setMyAvailability(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const body = availabilitySchema.parse(req.body);

  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { providerId: provider.id } }),
    prisma.availabilityRule.createMany({
      data: body.rules.map((r) => ({
        providerId: provider.id,
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
    }),
  ]);

  const rules = await prisma.availabilityRule.findMany({
    where: { providerId: provider.id },
  });
  res.status(200).json(serializeAvailability(rules));
}

// GET /api/me/blocks
export async function listMyBlocks(req: Request, res: Response): Promise<void> {
  const provider = await myProvider(req);
  const blocks = await prisma.timeBlock.findMany({
    where: { providerId: provider.id },
    orderBy: { startsAt: "asc" },
  });
  res.status(200).json({ items: blocks.map(serializeTimeBlock) });
}

// POST /api/me/blocks
export async function createMyBlock(req: Request, res: Response): Promise<void> {
  const provider = await myProvider(req);
  const body = blockSchema.parse(req.body);
  const block = await prisma.timeBlock.create({
    data: {
      providerId: provider.id,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      reason: body.reason ?? null,
    },
  });
  res.status(201).json(serializeTimeBlock(block));
}

// DELETE /api/me/blocks/:id
export async function deleteMyBlock(req: Request, res: Response): Promise<void> {
  const provider = await myProvider(req);
  const existing = await prisma.timeBlock.findFirst({
    where: { id: req.params.id, providerId: provider.id },
  });
  if (!existing) {
    throw httpError(404, "errors.provider.blockNotFound", {
      code: "BLOCK_NOT_FOUND",
    });
  }
  await prisma.timeBlock.delete({ where: { id: existing.id } });
  res.status(200).json({ ok: true });
}

// GET /api/me/bookings?from&to&status
export async function listMyBookings(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const status = parseBookingStatus(req.query.status);
  const from = parseStr(req.query.from);
  const to = parseStr(req.query.to);

  const where: Prisma.BookingWhereInput = { providerId: provider.id };
  if (status) where.status = status;
  const startsAt: Prisma.DateTimeFilter = {};
  if (from && !Number.isNaN(Date.parse(from))) startsAt.gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) startsAt.lte = new Date(to);
  if (startsAt.gte || startsAt.lte) where.startsAt = startsAt;

  const bookings = await prisma.booking.findMany({
    where,
    include: { service: true, provider: true, payment: true },
    orderBy: { startsAt: "asc" },
  });

  res.status(200).json({ items: bookings.map(serializeBookingAdmin) });
}

// PATCH /api/me/bookings/:id
export async function patchMyBooking(
  req: Request,
  res: Response
): Promise<void> {
  const provider = await myProvider(req);
  const body = providerBookingActionSchema.parse(req.body);

  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, providerId: provider.id },
    include: { service: true },
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
      meta: { bookingId: booking.id, by: "provider" },
    });
    res.status(200).json(serializeBookingAdmin(updated));
    return;
  }

  // action === "reschedule"
  if (
    booking.status !== BookingStatus.CONFIRMED &&
    booking.status !== BookingStatus.PENDING_PAYMENT
  ) {
    throw httpError(409, "errors.booking.notReschedulable", {
      code: "NOT_RESCHEDULABLE",
    });
  }
  const newStart = new Date(body.startsAt);
  const rules = await prisma.availabilityRule.findMany({
    where: { providerId: provider.id },
  });
  const slot = await validateSlot(prisma, {
    providerId: provider.id,
    timezone: provider.timezone,
    durationMin: booking.service.durationMin,
    startsAt: newStart,
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    })),
    excludeBookingId: booking.id,
  });
  if (!slot) {
    throw httpError(400, "errors.booking.slotInvalid", { code: "SLOT_INVALID" });
  }

  try {
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { startsAt: slot.startsAt, endsAt: slot.endsAt },
      include: { service: true, provider: true, payment: true },
    });
    await audit("booking.rescheduled", {
      actorId: req.auth!.userId,
      meta: { bookingId: booking.id, startsAt: slot.startsAt.toISOString() },
    });
    res.status(200).json(serializeBookingAdmin(updated));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw httpError(409, "errors.booking.slotTaken", { code: "SLOT_TAKEN" });
    }
    throw e;
  }
}

// GET /api/me/stats
export async function getMyStats(req: Request, res: Response): Promise<void> {
  const provider = await myProvider(req);
  const now = new Date();
  const monthStart = DateTime.now()
    .setZone(provider.timezone)
    .startOf("month")
    .toUTC()
    .toJSDate();
  const monthEnd = DateTime.now()
    .setZone(provider.timezone)
    .endOf("month")
    .toUTC()
    .toJSDate();

  const [upcoming, confirmedThisMonth, revenue, pendingCount] =
    await Promise.all([
      prisma.booking.count({
        where: {
          providerId: provider.id,
          status: BookingStatus.CONFIRMED,
          startsAt: { gte: now },
        },
      }),
      prisma.booking.count({
        where: {
          providerId: provider.id,
          status: BookingStatus.CONFIRMED,
          startsAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: {
          status: PaymentStatus.APPROVED,
          booking: { providerId: provider.id },
        },
      }),
      prisma.booking.count({
        where: {
          providerId: provider.id,
          status: BookingStatus.PENDING_PAYMENT,
          OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
        },
      }),
    ]);

  res.status(200).json({
    upcoming,
    confirmedThisMonth,
    revenueCents: revenue._sum.amountCents ?? 0,
    pendingCount,
  });
}
