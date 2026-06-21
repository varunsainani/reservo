import type { Request, Response } from "express";
import { Prisma, BookingStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { httpError } from "../lib/http-error";
import { audit } from "../lib/audit";
import { env } from "../lib/env";
import { publicToken as makePublicToken, slugify } from "../lib/slug";
import {
  serializeProviderCard,
  serializeProviderDetail,
  serializeBookingPublic,
  serializePaymentForCheckout,
} from "../lib/serialize";
import { parsePagination, parseStr } from "../lib/query";
import { availabilityQuerySchema, createBookingSchema } from "../lib/validation";
import { computeDayAvailability, validateSlot } from "../services/availability";
import { isPast, overlaps } from "../lib/slots";
import { getPaymentProvider } from "../payments";

// GET /api/providers
export async function listProviders(req: Request, res: Response): Promise<void> {
  const { page, pageSize, skip, take } = parsePagination(
    req.query as Record<string, unknown>
  );
  const q = parseStr(req.query.q);
  const category = parseStr(req.query.category);

  const searchOr = (term: string): Prisma.ProviderWhereInput["OR"] => [
    { name: { contains: term, mode: "insensitive" } },
    { slug: { contains: slugify(term), mode: "insensitive" } },
    { bio: { contains: term, mode: "insensitive" } },
    { city: { contains: term, mode: "insensitive" } },
    { category: { contains: term, mode: "insensitive" } },
  ];

  const where: Prisma.ProviderWhereInput = {};
  if (category) where.category = category;
  if (q) where.OR = searchOr(q);

  const [total, providers, categoryGroups] = await Promise.all([
    prisma.provider.count({ where }),
    prisma.provider.findMany({
      where,
      include: { services: { where: { active: true } } },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
    prisma.provider.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: q ? { OR: searchOr(q) } : undefined,
    }),
  ]);

  res.status(200).json({
    items: providers.map(serializeProviderCard),
    total,
    page,
    pageSize,
    facets: {
      categories: categoryGroups
        .filter((g) => g.category)
        .map((g) => ({ value: g.category, count: g._count._all }))
        .sort((a, b) => b.count - a.count),
    },
  });
}

// GET /api/providers/:slug
export async function getProvider(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug;
  const provider = await prisma.provider.findUnique({
    where: { slug },
    include: { services: true },
  });
  if (!provider) {
    throw httpError(404, "errors.booking.providerNotFound", {
      code: "PROVIDER_NOT_FOUND",
    });
  }
  res.status(200).json(serializeProviderDetail(provider));
}

// GET /api/providers/:slug/availability
export async function getAvailability(
  req: Request,
  res: Response
): Promise<void> {
  const slug = req.params.slug;
  const { serviceId, date } = availabilityQuerySchema.parse(req.query);

  const provider = await prisma.provider.findUnique({
    where: { slug },
    include: {
      availabilityRules: true,
      services: { where: { id: serviceId } },
    },
  });
  if (!provider) {
    throw httpError(404, "errors.booking.providerNotFound", {
      code: "PROVIDER_NOT_FOUND",
    });
  }
  const service = provider.services[0];
  if (!service || !service.active) {
    throw httpError(404, "errors.booking.serviceNotFound", {
      code: "SERVICE_NOT_FOUND",
    });
  }

  const result = await computeDayAvailability(prisma, {
    providerId: provider.id,
    timezone: provider.timezone,
    durationMin: service.durationMin,
    date,
    rules: provider.availabilityRules.map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    })),
  });

  res.status(200).json(result);
}

// POST /api/bookings
export async function createBooking(req: Request, res: Response): Promise<void> {
  const body = createBookingSchema.parse(req.body);
  const startsAt = new Date(body.startsAt);

  if (isPast(startsAt)) {
    throw httpError(400, "errors.booking.slotInPast", { code: "SLOT_IN_PAST" });
  }

  const provider = await prisma.provider.findUnique({
    where: { slug: body.providerSlug },
    include: {
      availabilityRules: true,
      services: { where: { id: body.serviceId } },
    },
  });
  if (!provider) {
    throw httpError(404, "errors.booking.providerNotFound", {
      code: "PROVIDER_NOT_FOUND",
    });
  }
  const service = provider.services[0];
  if (!service) {
    throw httpError(404, "errors.booking.serviceNotFound", {
      code: "SERVICE_NOT_FOUND",
    });
  }
  if (!service.active) {
    throw httpError(409, "errors.booking.serviceInactive", {
      code: "SERVICE_INACTIVE",
    });
  }

  // Validate the requested slot is structurally real (on the grid, not in a
  // TimeBlock, not past). Occupancy is enforced by the DB unique index below so
  // a same-slot collision returns 409 SLOT_TAKEN, not 400.
  const slot = await validateSlot(prisma, {
    providerId: provider.id,
    timezone: provider.timezone,
    durationMin: service.durationMin,
    startsAt,
    rules: provider.availabilityRules.map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    })),
    ignoreBookings: true,
  });
  if (!slot) {
    throw httpError(400, "errors.booking.slotInvalid", { code: "SLOT_INVALID" });
  }

  // Link customerId only when an authenticated CUSTOMER books.
  const customerId =
    req.auth && req.auth.role === "CUSTOMER" ? req.auth.userId : null;

  const holdExpiresAt = new Date(Date.now() + env.HOLD_MINUTES * 60 * 1000);
  const token = makePublicToken();
  const paymentProvider = getPaymentProvider();

  // Transaction: create booking (double-booking guard via partial unique index)
  // + the pending payment in one shot.
  let created: Awaited<ReturnType<typeof createBookingTx>>;
  try {
    created = await createBookingTx({
      providerId: provider.id,
      serviceId: service.id,
      customerId,
      customerName: body.customer.name,
      customerEmail: body.customer.email,
      customerPhone: body.customer.phone ?? null,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      priceCents: service.priceCents,
      currency: service.currency,
      holdExpiresAt,
      publicToken: token,
      notes: body.notes ?? null,
      providerKind: paymentProvider.kind,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw httpError(409, "errors.booking.slotTaken", { code: "SLOT_TAKEN" });
    }
    throw e;
  }

  // Create the checkout via the active provider, then persist its url/qr/externalId.
  const checkout = await paymentProvider.createCheckout(
    created.booking,
    created.payment
  );
  const payment = await prisma.payment.update({
    where: { id: created.payment.id },
    data: {
      externalId: checkout.externalId,
      checkoutUrl: checkout.checkoutUrl,
      pixQr: checkout.pixQr ?? null,
    },
  });

  await audit("booking.created", {
    actorId: customerId,
    meta: {
      bookingId: created.booking.id,
      providerId: provider.id,
      serviceId: service.id,
    },
  });

  const full = await prisma.booking.findUnique({
    where: { id: created.booking.id },
    include: {
      service: true,
      provider: true,
      payment: true,
    },
  });

  res.status(201).json({
    booking: serializeBookingPublic(full!),
    payment: serializePaymentForCheckout(payment),
  });
}

async function createBookingTx(input: {
  providerId: string;
  serviceId: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  priceCents: number;
  currency: string;
  holdExpiresAt: Date;
  publicToken: string;
  notes: string | null;
  providerKind: import("@prisma/client").PaymentProviderType;
}) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // 1) Expire elapsed holds for this provider so the write path matches the
    //    lazy-expiry read path: a PENDING_PAYMENT booking past its hold no longer
    //    occupies its slot (and its payment is settled EXPIRED).
    const elapsed = await tx.booking.findMany({
      where: {
        providerId: input.providerId,
        status: BookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { lt: now },
      },
      select: { id: true },
    });
    if (elapsed.length > 0) {
      const elapsedIds = elapsed.map((b) => b.id);
      await tx.booking.updateMany({
        where: { id: { in: elapsedIds } },
        data: { status: BookingStatus.EXPIRED },
      });
      await tx.payment.updateMany({
        where: {
          bookingId: { in: elapsedIds },
          status: PaymentStatus.PENDING,
        },
        data: { status: PaymentStatus.EXPIRED },
      });
    }

    // 2) Interval-overlap occupancy check. The partial unique index only guards
    //    the exact same start instant; this catches a *different-duration*
    //    booking that overlaps the requested window. Active = CONFIRMED, or
    //    PENDING_PAYMENT with a hold that is null/in the future.
    const active = await tx.booking.findMany({
      where: {
        providerId: input.providerId,
        // Cheap pre-filter: only rows that could possibly overlap the window.
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
        OR: [
          { status: BookingStatus.CONFIRMED },
          {
            status: BookingStatus.PENDING_PAYMENT,
            OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
          },
        ],
      },
      select: { startsAt: true, endsAt: true },
    });
    const wantStart = input.startsAt.getTime();
    const wantEnd = input.endsAt.getTime();
    const clash = active.some((b) =>
      overlaps(wantStart, wantEnd, b.startsAt.getTime(), b.endsAt.getTime())
    );
    if (clash) {
      throw httpError(409, "errors.booking.slotTaken", { code: "SLOT_TAKEN" });
    }

    const booking = await tx.booking.create({
      data: {
        providerId: input.providerId,
        serviceId: input.serviceId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: BookingStatus.PENDING_PAYMENT,
        priceCents: input.priceCents,
        currency: input.currency,
        holdExpiresAt: input.holdExpiresAt,
        publicToken: input.publicToken,
        notes: input.notes,
      },
    });

    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        provider: input.providerKind,
        status: PaymentStatus.PENDING,
        amountCents: input.priceCents,
        currency: input.currency,
      },
    });

    return { booking, payment };
  });
}

// GET /api/bookings/:id?token=...
export async function getBookingPublic(
  req: Request,
  res: Response
): Promise<void> {
  const id = req.params.id;
  const token = parseStr(req.query.token);
  if (!token) {
    // No enumeration: missing token is a 404, not a 401.
    throw httpError(404, "errors.booking.bookingNotFound", {
      code: "BOOKING_NOT_FOUND",
    });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { service: true, provider: true, payment: true },
  });

  if (!booking || booking.publicToken !== token) {
    throw httpError(404, "errors.booking.bookingNotFound", {
      code: "BOOKING_NOT_FOUND",
    });
  }

  // Lazy expiry on read: an unpaid hold past its deadline shows as EXPIRED.
  const effective = applyLazyExpiry(booking);
  res.status(200).json(serializeBookingPublic(effective));
}

/** If a PENDING_PAYMENT booking's hold has elapsed, present it as EXPIRED. */
function applyLazyExpiry<
  T extends {
    status: BookingStatus;
    holdExpiresAt: Date | null;
  }
>(booking: T): T {
  if (
    booking.status === BookingStatus.PENDING_PAYMENT &&
    booking.holdExpiresAt &&
    booking.holdExpiresAt.getTime() < Date.now()
  ) {
    return { ...booking, status: BookingStatus.EXPIRED };
  }
  return booking;
}
