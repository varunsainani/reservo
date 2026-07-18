import { PrismaClient, Role, BookingStatus, PaymentProviderType, PaymentMethod, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "demo1234";

function token(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// Build a UTC Date from a local wall-clock date+minute in a timezone.
function localSlot(dateISO: string, minute: number, tz: string): { startsAt: Date } {
  const start = DateTime.fromISO(dateISO, { zone: tz })
    .startOf("day")
    .plus({ minutes: minute });
  return { startsAt: start.toUTC().toJSDate() };
}

async function main(): Promise<void> {
  // ── Idempotent reset: clear in FK-safe order ─────────────────────────────
  await prisma.webhookEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.timeBlock.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.service.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Demo users ───────────────────────────────────────────────────────────
  const customer = await prisma.user.create({
    data: {
      email: "customer@reservo.app",
      passwordHash,
      name: "Emily Carter",
      role: Role.CUSTOMER,
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: "provider@reservo.app",
      passwordHash,
      name: "Dr. Helen Morris",
      role: Role.PROVIDER,
    },
  });
  await prisma.user.create({
    data: {
      email: "admin@reservo.app",
      passwordHash,
      name: "Reservo Admin",
      role: Role.ADMIN,
    },
  });

  // Extra provider-owner users (one per additional provider).
  const owner2 = await prisma.user.create({
    data: { email: "salon@reservo.app", passwordHash, name: "Brian Foster", role: Role.PROVIDER },
  });
  const owner3 = await prisma.user.create({
    data: { email: "consult@reservo.app", passwordHash, name: "Megan Lopez", role: Role.PROVIDER },
  });
  const owner4 = await prisma.user.create({
    data: { email: "studio@reservo.app", passwordHash, name: "Charles Nolan", role: Role.PROVIDER },
  });

  // ── Weekly availability template helper (Mon–Fri 09:00–17:00 + Sat 09:00–13:00) ──
  const weekdayTemplate = (
    extras: { saturday?: boolean } = {}
  ): { weekday: number; startMinute: number; endMinute: number }[] => {
    const rules: { weekday: number; startMinute: number; endMinute: number }[] = [];
    for (let wd = 1; wd <= 5; wd++) {
      rules.push({ weekday: wd, startMinute: 9 * 60, endMinute: 17 * 60 });
    }
    if (extras.saturday) {
      rules.push({ weekday: 6, startMinute: 9 * 60, endMinute: 13 * 60 });
    }
    return rules;
  };

  // ── Providers ──────────────────────────────────────────────────────────────
  const p1 = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      slug: "wellbeing-clinic",
      name: "Wellbeing Clinic",
      bio: "Personalized primary care, consultations and routine checkups in the heart of Austin.",
      category: "health",
      timezone: "America/Chicago",
      city: "Austin",
      region: "TX",
      country: "US",
      whatsapp: "+15125550001",
      avatarUrl: null,
      services: {
        create: [
          { name: "General consultation", description: "Overall health assessment.", durationMin: 30, priceCents: 12000, currency: "USD", sortOrder: 0 },
          { name: "Follow-up visit", description: "Follow-up consultation.", durationMin: 20, priceCents: 7000, currency: "USD", sortOrder: 1 },
          { name: "Full checkup", description: "Extended assessment with guidance.", durationMin: 60, priceCents: 20000, currency: "USD", sortOrder: 2 },
        ],
      },
      availabilityRules: { create: weekdayTemplate({ saturday: true }) },
    },
    include: { services: true },
  });

  const p2 = await prisma.provider.create({
    data: {
      userId: owner2.id,
      slug: "studio-glow-salon",
      name: "Studio Glow",
      bio: "Full-service beauty salon: haircuts, coloring, and hair treatments.",
      category: "beauty",
      timezone: "America/New_York",
      city: "Miami",
      region: "FL",
      country: "US",
      whatsapp: "+13055550002",
      services: {
        create: [
          { name: "Women's haircut", durationMin: 45, priceCents: 6000, currency: "USD", sortOrder: 0 },
          { name: "Hair coloring", durationMin: 90, priceCents: 14000, currency: "USD", sortOrder: 1 },
          { name: "Deep conditioning", durationMin: 30, priceCents: 4500, currency: "USD", sortOrder: 2 },
        ],
      },
      availabilityRules: { create: weekdayTemplate({ saturday: true }) },
    },
    include: { services: true },
  });

  const p3 = await prisma.provider.create({
    data: {
      userId: owner3.id,
      slug: "lopez-consulting",
      name: "Lopez Consulting",
      bio: "Business strategy consulting for small and mid-sized companies.",
      category: "consulting",
      timezone: "America/New_York",
      city: "New York",
      region: "NY",
      country: "US",
      whatsapp: "+12125550003",
      services: {
        create: [
          { name: "Strategy session", description: "Diagnosis and action plan.", durationMin: 60, priceCents: 15000, currency: "USD", sortOrder: 0 },
          { name: "Express mentoring", durationMin: 30, priceCents: 8000, currency: "USD", sortOrder: 1 },
        ],
      },
      availabilityRules: { create: weekdayTemplate() },
    },
    include: { services: true },
  });

  const p4 = await prisma.provider.create({
    data: {
      userId: owner4.id,
      slug: "core-fitness-studio",
      name: "Core Fitness Studio",
      bio: "Personalized training and functional classes in Denver.",
      category: "fitness",
      timezone: "America/Denver",
      city: "Denver",
      region: "CO",
      country: "US",
      whatsapp: "+17205550004",
      services: {
        create: [
          { name: "Personal training", durationMin: 60, priceCents: 7000, currency: "USD", sortOrder: 0 },
          { name: "Functional class", durationMin: 45, priceCents: 3000, currency: "USD", sortOrder: 1 },
          { name: "Fitness assessment", durationMin: 30, priceCents: 4500, currency: "USD", sortOrder: 2 },
        ],
      },
      availabilityRules: { create: weekdayTemplate({ saturday: true }) },
    },
    include: { services: true },
  });

  const providers = [p1, p2, p3, p4];

  // ── Time blocks (1–2 each) ─────────────────────────────────────────────────
  const tomorrow = DateTime.now().plus({ days: 1 });
  for (const p of providers) {
    const lunchDay = tomorrow.setZone(p.timezone).startOf("day");
    await prisma.timeBlock.create({
      data: {
        providerId: p.id,
        startsAt: lunchDay.plus({ hours: 12 }).toUTC().toJSDate(),
        endsAt: lunchDay.plus({ hours: 13 }).toUTC().toJSDate(),
        reason: "Lunch break",
      },
    });
  }
  await prisma.timeBlock.create({
    data: {
      providerId: p1.id,
      startsAt: tomorrow.plus({ days: 2 }).setZone(p1.timezone).startOf("day").plus({ hours: 9 }).toUTC().toJSDate(),
      endsAt: tomorrow.plus({ days: 2 }).setZone(p1.timezone).startOf("day").plus({ hours: 17 }).toUTC().toJSDate(),
      reason: "Holiday",
    },
  });

  // ── Bookings spread over the next ~14 days ──────────────────────────────────
  // Find the next weekday (Mon–Fri) date string in a tz, offset by `addDays`.
  const nextBusinessDate = (tz: string, addDays: number): string => {
    let d = DateTime.now().setZone(tz).startOf("day").plus({ days: addDays });
    while (d.weekday > 5) d = d.plus({ days: 1 }); // skip Sat(6)/Sun(7)
    return d.toFormat("yyyy-MM-dd");
  };

  type BookingSeed = {
    provider: typeof p1;
    serviceIdx: number;
    dayOffset: number;
    minute: number;
    status: BookingStatus;
    method: PaymentMethod;
    paymentStatus: PaymentStatus;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    linkCustomer?: boolean;
    holdMinutesFromNow?: number | null;
  };

  const seeds: BookingSeed[] = [
    // CONFIRMED — Pix
    { provider: p1, serviceIdx: 0, dayOffset: 2, minute: 9 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.APPROVED, customerName: "Emily Carter", customerEmail: "customer@reservo.app", customerPhone: "+15125559999", linkCustomer: true },
    // CONFIRMED — Card
    { provider: p1, serviceIdx: 2, dayOffset: 3, minute: 14 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.CARD, paymentStatus: PaymentStatus.APPROVED, customerName: "Michael Reed", customerEmail: "michael@example.com" },
    { provider: p2, serviceIdx: 0, dayOffset: 1, minute: 10 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.APPROVED, customerName: "Sophie Bennett", customerEmail: "sophie@example.com" },
    { provider: p3, serviceIdx: 0, dayOffset: 4, minute: 11 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.CARD, paymentStatus: PaymentStatus.APPROVED, customerName: "Daniel Rivera", customerEmail: "daniel@example.com" },
    { provider: p4, serviceIdx: 1, dayOffset: 2, minute: 16 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.APPROVED, customerName: "Laura Fields", customerEmail: "laura@example.com" },
    // PENDING_PAYMENT — fresh holds
    { provider: p1, serviceIdx: 1, dayOffset: 5, minute: 15 * 60, status: BookingStatus.PENDING_PAYMENT, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.PENDING, customerName: "James Parker", customerEmail: "james@example.com", holdMinutesFromNow: 15 },
    { provider: p2, serviceIdx: 1, dayOffset: 6, minute: 11 * 60, status: BookingStatus.PENDING_PAYMENT, method: PaymentMethod.CARD, paymentStatus: PaymentStatus.PENDING, customerName: "Fiona Dawson", customerEmail: "fiona@example.com", holdMinutesFromNow: 15 },
    // EXPIRED — old elapsed hold
    { provider: p1, serviceIdx: 0, dayOffset: 7, minute: 10 * 60, status: BookingStatus.EXPIRED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.EXPIRED, customerName: "Peter Grant", customerEmail: "peter@example.com", holdMinutesFromNow: -60 },
    // CANCELLED
    { provider: p2, serviceIdx: 2, dayOffset: 8, minute: 14 * 60, status: BookingStatus.CANCELLED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.REJECTED, customerName: "Alice Rowe", customerEmail: "alice@example.com" },
  ];

  let bookingCount = 0;
  for (const s of seeds) {
    const service = s.provider.services[s.serviceIdx];
    const date = nextBusinessDate(s.provider.timezone, s.dayOffset);
    const { startsAt } = localSlot(date, s.minute, s.provider.timezone);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);

    const holdExpiresAt =
      s.holdMinutesFromNow === undefined || s.holdMinutesFromNow === null
        ? null
        : new Date(Date.now() + s.holdMinutesFromNow * 60 * 1000);

    const booking = await prisma.booking.create({
      data: {
        providerId: s.provider.id,
        serviceId: service.id,
        customerId: s.linkCustomer ? customer.id : null,
        customerName: s.customerName,
        customerEmail: s.customerEmail,
        customerPhone: s.customerPhone ?? null,
        startsAt,
        endsAt,
        status: s.status,
        priceCents: service.priceCents,
        currency: service.currency,
        holdExpiresAt,
        publicToken: token(),
      },
    });

    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: PaymentProviderType.SIMULATED,
        method: s.method,
        externalId: `seed_${crypto.randomBytes(8).toString("hex")}`,
        status: s.paymentStatus,
        amountCents: service.priceCents,
        currency: service.currency,
        checkoutUrl: `http://localhost:3000/checkout/${booking.id}?token=${booking.publicToken}`,
        pixQr: s.method === PaymentMethod.PIX ? `00020126RESERVO-SIM-PIX${booking.publicToken.slice(0, 12).toUpperCase()}5802BR6304SEED` : null,
      },
    });

    bookingCount++;
  }

  // ── Counts ──────────────────────────────────────────────────────────────
  const [users, provs, services, rules, blocks, bookings, payments] =
    await Promise.all([
      prisma.user.count(),
      prisma.provider.count(),
      prisma.service.count(),
      prisma.availabilityRule.count(),
      prisma.timeBlock.count(),
      prisma.booking.count(),
      prisma.payment.count(),
    ]);

  // eslint-disable-next-line no-console
  console.log("Seed complete:", {
    users,
    providers: provs,
    services,
    availabilityRules: rules,
    timeBlocks: blocks,
    bookings,
    payments,
    seededBookings: bookingCount,
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
