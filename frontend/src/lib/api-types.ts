// ---------------------------------------------------------------------------
// API response shapes — mirror SPEC.md exactly. Both client + server API use
// these. Keep in lockstep with the backend; deviations are noted in the build
// report so they can be reconciled.
// ---------------------------------------------------------------------------

export type Role = "CUSTOMER" | "PROVIDER" | "ADMIN";

export type BookingStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED";

export type PaymentProviderType = "SIMULATED" | "MERCADOPAGO";
export type PaymentMethod = "PIX" | "CARD";
export type PaymentStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "REFUNDED";

export type Currency = "BRL" | "ARS" | "MXN" | "USD";

// ---- Auth ----
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface SessionResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ---- Providers (public) ----
export interface ProviderCard {
  id: string;
  slug: string;
  name: string;
  bio?: string | null;
  category: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  timezone: string;
  avatarUrl?: string | null;
  // Convenience fields the listing may surface (optional, tolerated if absent).
  serviceCount?: number;
  priceFromCents?: number | null;
  currency?: Currency;
}

export interface Service {
  id: string;
  providerId?: string;
  name: string;
  description?: string | null;
  durationMin: number;
  priceCents: number;
  currency: Currency;
  active: boolean;
  sortOrder: number;
}

export interface ProviderDetail {
  id: string;
  slug: string;
  name: string;
  bio?: string | null;
  category: string;
  timezone: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  avatarUrl?: string | null;
  whatsapp?: string | null;
  services: Service[];
  // Present on the owner's own provider (GET /api/me/provider).
  availability?: AvailabilityRule[];
  blocks?: TimeBlock[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface ProviderListResponse {
  items: ProviderCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: { categories: FacetValue[] };
}

// ---- Slots ----
export interface Slot {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
}

export interface AvailabilityResponse {
  date: string; // YYYY-MM-DD
  slots: Slot[];
}

// ---- Bookings (public/customer) ----
export interface BookingPublic {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  currency: Currency;
  publicToken: string;
  service: { name: string; durationMin: number };
  provider: { name: string; slug: string; timezone: string; whatsapp?: string | null };
  payment: { status: PaymentStatus; method?: PaymentMethod | null };
  customerName: string;
}

export interface PaymentPreference {
  id: string;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  checkoutUrl: string;
  pixQr?: string | null;
}

export interface CreateBookingResponse {
  booking: BookingPublic;
  payment: PaymentPreference;
}

// ---- Provider / Admin booking rows ----
export interface BookingAdmin {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  currency: Currency;
  service: { name: string; durationMin: number };
  provider: { name: string; slug: string; timezone: string };
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  notes?: string | null;
  createdAt: string;
  payment: { status: PaymentStatus; method?: PaymentMethod | null; amountCents: number };
}

// ---- Availability template ----
export interface AvailabilityRule {
  weekday: number; // 0=Sun .. 6=Sat
  startMinute: number;
  endMinute: number;
}

export interface TimeBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
}

// ---- Provider stats ----
export interface ProviderStats {
  upcoming: number;
  confirmedThisMonth: number;
  revenueCents: number;
  pendingCount: number;
}

// ---- Admin ----
export interface AdminOverview {
  providers: number;
  bookings: {
    total: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    expired: number;
  };
  revenueCents: number;
  recentBookings: BookingAdmin[];
  topProviders: { id: string; name: string; slug: string; bookings: number; revenueCents: number }[];
}

export interface AdminBookingList {
  items: BookingAdmin[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminProviderRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  city?: string | null;
  timezone: string;
  serviceCount: number;
  bookingCount: number;
  revenueCents: number;
  ownerEmail?: string | null;
}

export interface AdminProviderList {
  items: AdminProviderRow[];
  total: number;
  page: number;
  pageSize: number;
}
