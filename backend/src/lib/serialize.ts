import type {
  AvailabilityRule,
  Booking,
  Payment,
  Provider,
  Service,
  TimeBlock,
  User,
} from "@prisma/client";

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

// ── User ───────────────────────────────────────────────────────────────────
export function serializeUser(u: Pick<User, "id" | "email" | "name" | "role">) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

// ── Service ──────────────────────────────────────────────────────────────────
export function serializeService(s: Service) {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    durationMin: s.durationMin,
    priceCents: s.priceCents,
    currency: s.currency,
    active: s.active,
    sortOrder: s.sortOrder,
  };
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function serializeProviderCard(
  p: Provider & { services?: Service[]; _count?: { bookings: number } }
) {
  const prices = (p.services ?? [])
    .filter((s) => s.active)
    .map((s) => s.priceCents);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    bio: p.bio,
    category: p.category,
    city: p.city,
    region: p.region,
    country: p.country,
    timezone: p.timezone,
    avatarUrl: p.avatarUrl ?? null,
    serviceCount: (p.services ?? []).filter((s) => s.active).length,
    priceFromCents: prices.length ? Math.min(...prices) : null,
    currency: (p.services ?? [])[0]?.currency ?? "BRL",
  };
}

export function serializeProviderDetail(
  p: Provider & {
    services?: Service[];
    availabilityRules?: AvailabilityRule[];
    timeBlocks?: TimeBlock[];
  },
  opts: { includePrivate?: boolean } = {}
) {
  const base = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    bio: p.bio,
    category: p.category,
    timezone: p.timezone,
    city: p.city,
    region: p.region,
    country: p.country,
    whatsapp: p.whatsapp ?? null,
    avatarUrl: p.avatarUrl ?? null,
    services: (p.services ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(serializeService),
  };
  if (!opts.includePrivate) {
    // Public detail only exposes active services.
    base.services = base.services.filter((s) => s.active);
    return base;
  }
  return {
    ...base,
    availability: {
      rules: (p.availabilityRules ?? [])
        .slice()
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
        .map((r) => ({
          id: r.id,
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        })),
    },
    blocks: (p.timeBlocks ?? [])
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map(serializeTimeBlock),
  };
}

export function serializeTimeBlock(b: TimeBlock) {
  return {
    id: b.id,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    reason: b.reason ?? null,
  };
}

export function serializeAvailability(rules: AvailabilityRule[]) {
  return {
    rules: rules
      .slice()
      .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
      .map((r) => ({
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
  };
}

// ── Booking (public) ─────────────────────────────────────────────────────────
type BookingWithRels = Booking & {
  service?: Pick<Service, "name" | "durationMin"> | null;
  provider?: Pick<Provider, "name" | "slug" | "timezone" | "whatsapp"> | null;
  payment?: Pick<Payment, "status" | "method"> | null;
};

export function serializeBookingPublic(b: BookingWithRels) {
  return {
    id: b.id,
    status: b.status,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    priceCents: b.priceCents,
    currency: b.currency,
    publicToken: b.publicToken,
    customerName: b.customerName,
    service: b.service
      ? { name: b.service.name, durationMin: b.service.durationMin }
      : null,
    provider: b.provider
      ? {
          name: b.provider.name,
          slug: b.provider.slug,
          timezone: b.provider.timezone,
          whatsapp: b.provider.whatsapp ?? null,
        }
      : null,
    payment: b.payment
      ? { status: b.payment.status, method: b.payment.method ?? null }
      : null,
  };
}

// ── Booking (admin / provider) ───────────────────────────────────────────────
type BookingAdminRels = Booking & {
  service?: Pick<Service, "name" | "durationMin"> | null;
  provider?: Pick<Provider, "name" | "slug" | "timezone"> | null;
  payment?: Pick<
    Payment,
    "status" | "method" | "amountCents"
  > | null;
};

export function serializeBookingAdmin(b: BookingAdminRels) {
  return {
    id: b.id,
    status: b.status,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    priceCents: b.priceCents,
    currency: b.currency,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone ?? null,
    notes: b.notes ?? null,
    createdAt: b.createdAt.toISOString(),
    holdExpiresAt: iso(b.holdExpiresAt),
    service: b.service
      ? { name: b.service.name, durationMin: b.service.durationMin }
      : null,
    provider: b.provider
      ? { name: b.provider.name, slug: b.provider.slug, timezone: b.provider.timezone }
      : null,
    payment: b.payment
      ? {
          status: b.payment.status,
          method: b.payment.method ?? null,
          amountCents: b.payment.amountCents,
        }
      : null,
  };
}

// ── Payment (booking-create response) ────────────────────────────────────────
export function serializePaymentForCheckout(p: Payment) {
  return {
    id: p.id,
    status: p.status,
    method: p.method ?? null,
    checkoutUrl: p.checkoutUrl ?? null,
    pixQr: p.pixQr ?? null,
  };
}
