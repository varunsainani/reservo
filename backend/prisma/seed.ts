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
      name: "Camila Costa",
      role: Role.CUSTOMER,
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: "provider@reservo.app",
      passwordHash,
      name: "Dra. Helena Martins",
      role: Role.PROVIDER,
    },
  });
  await prisma.user.create({
    data: {
      email: "admin@reservo.app",
      passwordHash,
      name: "Admin Reservo",
      role: Role.ADMIN,
    },
  });

  // Extra provider-owner users (one per additional provider).
  const owner2 = await prisma.user.create({
    data: { email: "salon@reservo.app", passwordHash, name: "Bruno Alves", role: Role.PROVIDER },
  });
  const owner3 = await prisma.user.create({
    data: { email: "consult@reservo.app", passwordHash, name: "Mariana Lopez", role: Role.PROVIDER },
  });
  const owner4 = await prisma.user.create({
    data: { email: "studio@reservo.app", passwordHash, name: "Carlos Núñez", role: Role.PROVIDER },
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
      slug: "clinica-bem-estar",
      name: "Clínica Bem-Estar",
      bio: "Atendimento clínico humanizado, consultas e exames de rotina no centro de São Paulo.",
      category: "health",
      timezone: "America/Sao_Paulo",
      city: "São Paulo",
      region: "SP",
      country: "BR",
      whatsapp: "+5511999990001",
      avatarUrl: null,
      services: {
        create: [
          { name: "Consulta clínica", description: "Avaliação geral de saúde.", durationMin: 30, priceCents: 18000, currency: "BRL", sortOrder: 0 },
          { name: "Retorno", description: "Consulta de acompanhamento.", durationMin: 20, priceCents: 9000, currency: "BRL", sortOrder: 1 },
          { name: "Checkup completo", description: "Avaliação ampliada com orientações.", durationMin: 60, priceCents: 35000, currency: "BRL", sortOrder: 2 },
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
      bio: "Salão de beleza completo: cortes, coloração e tratamentos capilares.",
      category: "beauty",
      timezone: "America/Sao_Paulo",
      city: "Rio de Janeiro",
      region: "RJ",
      country: "BR",
      whatsapp: "+5521999990002",
      services: {
        create: [
          { name: "Corte feminino", durationMin: 45, priceCents: 12000, currency: "BRL", sortOrder: 0 },
          { name: "Coloração", durationMin: 90, priceCents: 28000, currency: "BRL", sortOrder: 1 },
          { name: "Hidratação", durationMin: 30, priceCents: 8000, currency: "BRL", sortOrder: 2 },
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
      bio: "Consultoría de negocios y estrategia para pymes en Latinoamérica.",
      category: "consulting",
      timezone: "America/Mexico_City",
      city: "Ciudad de México",
      region: "CDMX",
      country: "MX",
      whatsapp: "+5215555550003",
      services: {
        create: [
          { name: "Sesión de estrategia", description: "Diagnóstico y plan de acción.", durationMin: 60, priceCents: 150000, currency: "MXN", sortOrder: 0 },
          { name: "Mentoría exprés", durationMin: 30, priceCents: 80000, currency: "MXN", sortOrder: 1 },
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
      bio: "Entrenamiento personalizado y clases funcionales en Buenos Aires.",
      category: "fitness",
      timezone: "America/Argentina/Buenos_Aires",
      city: "Buenos Aires",
      region: "CABA",
      country: "AR",
      whatsapp: "+5491155550004",
      services: {
        create: [
          { name: "Entrenamiento personal", durationMin: 60, priceCents: 1200000, currency: "ARS", sortOrder: 0 },
          { name: "Clase funcional", durationMin: 45, priceCents: 600000, currency: "ARS", sortOrder: 1 },
          { name: "Evaluación física", durationMin: 30, priceCents: 400000, currency: "ARS", sortOrder: 2 },
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
        reason: "Almoço / pausa",
      },
    });
  }
  await prisma.timeBlock.create({
    data: {
      providerId: p1.id,
      startsAt: tomorrow.plus({ days: 2 }).setZone(p1.timezone).startOf("day").plus({ hours: 9 }).toUTC().toJSDate(),
      endsAt: tomorrow.plus({ days: 2 }).setZone(p1.timezone).startOf("day").plus({ hours: 17 }).toUTC().toJSDate(),
      reason: "Feriado",
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
    { provider: p1, serviceIdx: 0, dayOffset: 2, minute: 9 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.APPROVED, customerName: "Camila Costa", customerEmail: "customer@reservo.app", customerPhone: "+5511988887777", linkCustomer: true },
    // CONFIRMED — Card
    { provider: p1, serviceIdx: 2, dayOffset: 3, minute: 14 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.CARD, paymentStatus: PaymentStatus.APPROVED, customerName: "Rafael Souza", customerEmail: "rafael@example.com" },
    { provider: p2, serviceIdx: 0, dayOffset: 1, minute: 10 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.APPROVED, customerName: "Beatriz Lima", customerEmail: "bia@example.com" },
    { provider: p3, serviceIdx: 0, dayOffset: 4, minute: 11 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.CARD, paymentStatus: PaymentStatus.APPROVED, customerName: "Diego Ramírez", customerEmail: "diego@example.com" },
    { provider: p4, serviceIdx: 1, dayOffset: 2, minute: 16 * 60, status: BookingStatus.CONFIRMED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.APPROVED, customerName: "Lucía Fernández", customerEmail: "lucia@example.com" },
    // PENDING_PAYMENT — fresh holds
    { provider: p1, serviceIdx: 1, dayOffset: 5, minute: 15 * 60, status: BookingStatus.PENDING_PAYMENT, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.PENDING, customerName: "João Pereira", customerEmail: "joao@example.com", holdMinutesFromNow: 15 },
    { provider: p2, serviceIdx: 1, dayOffset: 6, minute: 11 * 60, status: BookingStatus.PENDING_PAYMENT, method: PaymentMethod.CARD, paymentStatus: PaymentStatus.PENDING, customerName: "Fernanda Dias", customerEmail: "fer@example.com", holdMinutesFromNow: 15 },
    // EXPIRED — old elapsed hold
    { provider: p1, serviceIdx: 0, dayOffset: 7, minute: 10 * 60, status: BookingStatus.EXPIRED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.EXPIRED, customerName: "Pedro Gomes", customerEmail: "pedro@example.com", holdMinutesFromNow: -60 },
    // CANCELLED
    { provider: p2, serviceIdx: 2, dayOffset: 8, minute: 14 * 60, status: BookingStatus.CANCELLED, method: PaymentMethod.PIX, paymentStatus: PaymentStatus.REJECTED, customerName: "Aline Rocha", customerEmail: "aline@example.com" },
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
