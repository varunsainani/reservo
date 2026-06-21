import type { PrismaClient, Prisma } from "@prisma/client";
import { BookingStatus } from "@prisma/client";
import { computeSlots, resolveSlot } from "../lib/slots";
import type { AvailabilityWindow, BusyInterval, Slot } from "../lib/slots";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Gather the busy intervals for a provider on a given local date window:
 * TimeBlocks + active bookings (CONFIRMED, or PENDING_PAYMENT whose hold has
 * not elapsed). Lazy-expiry: a PENDING booking past holdExpiresAt is omitted,
 * so its slot is free again.
 */
export async function getBusyIntervals(
  db: Db,
  providerId: string,
  rangeStart: Date,
  rangeEnd: Date,
  now: Date = new Date(),
  opts: { includeBookings?: boolean } = {}
): Promise<BusyInterval[]> {
  const includeBookings = opts.includeBookings ?? true;
  const [blocks, bookings] = await Promise.all([
    db.timeBlock.findMany({
      where: {
        providerId,
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
    includeBookings
      ? db.booking.findMany({
          where: {
            providerId,
            startsAt: { lt: rangeEnd },
            endsAt: { gt: rangeStart },
            OR: [
              { status: BookingStatus.CONFIRMED },
              {
                status: BookingStatus.PENDING_PAYMENT,
                OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
              },
            ],
          },
          select: { startsAt: true, endsAt: true },
        })
      : Promise.resolve([] as { startsAt: Date; endsAt: Date }[]),
  ]);

  return [
    ...blocks.map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt })),
    ...bookings.map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt })),
  ];
}

export interface DayAvailability {
  date: string;
  slots: Slot[];
}

/** Compute free slots for a provider+service on a local YYYY-MM-DD date. */
export async function computeDayAvailability(
  db: Db,
  args: {
    providerId: string;
    timezone: string;
    durationMin: number;
    date: string;
    rules: AvailabilityWindow[];
    now?: Date;
  }
): Promise<DayAvailability> {
  const now = args.now ?? new Date();
  // Pad the busy lookup window so slots near midnight boundaries match correctly.
  const rangeStart = new Date(`${args.date}T00:00:00.000Z`);
  const rangeStartPadded = new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000);
  const rangeEndPadded = new Date(rangeStart.getTime() + 48 * 60 * 60 * 1000);

  const busy = await getBusyIntervals(
    db,
    args.providerId,
    rangeStartPadded,
    rangeEndPadded,
    now
  );

  const slots = computeSlots({
    timezone: args.timezone,
    durationMin: args.durationMin,
    date: args.date,
    rules: args.rules,
    busy,
    now,
  });

  return { date: args.date, slots };
}

/**
 * Validate a requested startsAt against the provider's availability + busy
 * intervals. Returns the resolved {startsAt,endsAt} or null.
 *
 * `ignoreBookings` (used on CREATE): validate only the grid + TimeBlocks + past,
 * leaving booking-occupancy to the DB partial-unique index so an exact-slot
 * collision surfaces as a 409 SLOT_TAKEN (correct race semantics) rather than a
 * misleading 400. On RESCHEDULE we keep booking checks (excluding self) so an
 * overlap with a *different* slot's booking is still caught.
 */
export async function validateSlot(
  db: Db,
  args: {
    providerId: string;
    timezone: string;
    durationMin: number;
    startsAt: Date;
    rules: AvailabilityWindow[];
    excludeBookingId?: string;
    ignoreBookings?: boolean;
    now?: Date;
  }
): Promise<{ startsAt: Date; endsAt: Date } | null> {
  const now = args.now ?? new Date();
  const rangeStart = new Date(args.startsAt.getTime() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(args.startsAt.getTime() + 24 * 60 * 60 * 1000);

  const busyAll = await getBusyIntervals(
    db,
    args.providerId,
    rangeStart,
    rangeEnd,
    now,
    { includeBookings: !args.ignoreBookings }
  );

  // When rescheduling, exclude the booking's own current interval.
  let busy = busyAll;
  if (args.excludeBookingId) {
    const self = await db.booking.findUnique({
      where: { id: args.excludeBookingId },
      select: { startsAt: true, endsAt: true },
    });
    if (self) {
      busy = busyAll.filter(
        (b) =>
          !(
            b.startsAt.getTime() === self.startsAt.getTime() &&
            b.endsAt.getTime() === self.endsAt.getTime()
          )
      );
    }
  }

  return resolveSlot({
    timezone: args.timezone,
    durationMin: args.durationMin,
    startsAt: args.startsAt,
    rules: args.rules,
    busy,
    now,
  });
}
