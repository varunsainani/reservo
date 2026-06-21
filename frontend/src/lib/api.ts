// ---------------------------------------------------------------------------
// Reservo API client (browser). Same-origin: requests go to "/api/..." and are
// proxied to the backend by the Next.js rewrite, so the app lives behind one
// URL. Attaches the Bearer access token + X-Locale, transparently refreshes
// once on a 401, and throws a typed ApiError. Response shapes mirror SPEC.
// ---------------------------------------------------------------------------
import {
  getToken,
  getRefresh,
  setSession,
  setCachedUser,
  clearAuth,
} from "./session";
import type {
  SessionResponse,
  User,
  ProviderListResponse,
  ProviderDetail,
  AvailabilityResponse,
  CreateBookingResponse,
  BookingPublic,
  BookingAdmin,
  AvailabilityRule,
  TimeBlock,
  ProviderStats,
  Service,
  AdminOverview,
  AdminBookingList,
  AdminProviderList,
  BookingStatus,
} from "./api-types";

const BASE = process.env.NEXT_PUBLIC_API_URL || ""; // empty → same-origin /api

// Demo credentials surfaced to the login/register one-click buttons.
export const DEMO = {
  customer: {
    email: process.env.NEXT_PUBLIC_DEMO_CUSTOMER_EMAIL || "",
    password: process.env.NEXT_PUBLIC_DEMO_CUSTOMER_PASSWORD || "",
  },
  provider: {
    email: process.env.NEXT_PUBLIC_DEMO_PROVIDER_EMAIL || "",
    password: process.env.NEXT_PUBLIC_DEMO_PROVIDER_PASSWORD || "",
  },
  admin: {
    email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "",
    password: process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || "",
  },
} as const;

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  code?: string;
  details?: Record<string, string>;
  status: number;
  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Read the locale chosen via the language toggle. When unset, omit the header
// so the backend falls back to the browser's Accept-Language.
function getLocaleCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Auth endpoints that must never trigger refresh-and-retry (they ARE the flow).
const NO_REFRESH = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
];

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefresh();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.accessToken) {
      setSession(data.accessToken, data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const locale = getLocaleCookie();
  if (locale) headers["X-Locale"] = locale;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("network_error", 0, "NETWORK");
  }

  // Access token expired: rotate via refresh token and retry once.
  if (
    res.status === 401 &&
    !retried &&
    getRefresh() &&
    !NO_REFRESH.some((p) => path.startsWith(p))
  ) {
    if (await refreshSession()) return api<T>(path, opts, true);
  }

  // 204 / empty body tolerance.
  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: Record<string, string> } } | null)
      ?.error;
    throw new ApiError(
      err?.message || `request_failed_${res.status}`,
      res.status,
      err?.code,
      err?.details,
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function login(email: string, password: string) {
  const data = await api<SessionResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setSession(data.accessToken, data.refreshToken);
  setCachedUser(data.user);
  return data;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  role: "CUSTOMER" | "PROVIDER";
}) {
  const data = await api<SessionResponse>("/api/auth/register", {
    method: "POST",
    body: payload,
  });
  setSession(data.accessToken, data.refreshToken);
  setCachedUser(data.user);
  return data;
}

export async function logout() {
  const refreshToken = getRefresh();
  try {
    await api("/api/auth/logout", { method: "POST", body: { refreshToken } });
  } catch {
    // Best effort: clear local session regardless of the network result.
  }
  clearAuth();
}

export async function getMe(): Promise<User> {
  const data = await api<{ user: User }>("/api/auth/me");
  setCachedUser(data.user);
  return data.user;
}

// ---------------------------------------------------------------------------
// Public: providers / availability / bookings
// ---------------------------------------------------------------------------
export function listProviders(params: {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const suffix = qs.toString() ? `?${qs}` : "";
  return api<ProviderListResponse>(`/api/providers${suffix}`);
}

export function getProvider(slug: string) {
  return api<ProviderDetail>(`/api/providers/${encodeURIComponent(slug)}`);
}

export function getAvailability(slug: string, serviceId: string, date: string) {
  const qs = new URLSearchParams({ serviceId, date });
  return api<AvailabilityResponse>(
    `/api/providers/${encodeURIComponent(slug)}/availability?${qs}`,
  );
}

export function createBooking(body: {
  providerSlug: string;
  serviceId: string;
  startsAt: string;
  customer: { name: string; email: string; phone?: string };
  notes?: string;
}) {
  return api<CreateBookingResponse>("/api/bookings", { method: "POST", body });
}

export function getBooking(id: string, token: string) {
  const qs = new URLSearchParams({ token });
  return api<BookingPublic>(`/api/bookings/${encodeURIComponent(id)}?${qs}`);
}

export function simulatePayment(body: {
  bookingId: string;
  token: string;
  outcome: "approved" | "rejected";
}) {
  return api<{ ok: boolean }>("/api/payments/simulate", { method: "POST", body });
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
export function listMyBookings() {
  return api<{ items: BookingAdmin[] }>("/api/me/bookings-customer");
}

// ---------------------------------------------------------------------------
// Provider area (/api/me/*)
// ---------------------------------------------------------------------------
export function getMyProvider() {
  return api<ProviderDetail>("/api/me/provider");
}

export function updateMyProvider(body: {
  name: string;
  slug?: string;
  bio: string;
  category: string;
  timezone: string;
  city: string;
  region: string;
  country: string;
  whatsapp?: string;
  avatarUrl?: string;
}) {
  return api<ProviderDetail>("/api/me/provider", { method: "PUT", body });
}

export function listMyServices() {
  return api<{ items: Service[] }>("/api/me/services");
}

export function createMyService(body: {
  name: string;
  description?: string;
  durationMin: number;
  priceCents: number;
  currency: string;
  active: boolean;
  sortOrder: number;
}) {
  return api<Service>("/api/me/services", { method: "POST", body });
}

export function updateMyService(
  id: string,
  body: {
    name: string;
    description?: string;
    durationMin: number;
    priceCents: number;
    currency: string;
    active: boolean;
    sortOrder: number;
  },
) {
  return api<Service>(`/api/me/services/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
  });
}

export function deleteMyService(id: string) {
  return api<{ ok: boolean }>(`/api/me/services/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getMyAvailability() {
  return api<{ rules: AvailabilityRule[] }>("/api/me/availability");
}

export function putMyAvailability(rules: AvailabilityRule[]) {
  return api<{ rules: AvailabilityRule[] }>("/api/me/availability", {
    method: "PUT",
    body: { rules },
  });
}

export function listMyBlocks() {
  return api<{ items: TimeBlock[] }>("/api/me/blocks");
}

export function createMyBlock(body: { startsAt: string; endsAt: string; reason?: string }) {
  return api<TimeBlock>("/api/me/blocks", { method: "POST", body });
}

export function deleteMyBlock(id: string) {
  return api<{ ok: boolean }>(`/api/me/blocks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listMyProviderBookings(params: {
  from?: string;
  to?: string;
  status?: BookingStatus;
}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return api<{ items: BookingAdmin[] }>(`/api/me/bookings${suffix}`);
}

export function patchMyBooking(
  id: string,
  body: { action: "cancel" } | { action: "reschedule"; startsAt: string },
) {
  return api<BookingAdmin>(`/api/me/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function getMyStats() {
  return api<ProviderStats>("/api/me/stats");
}

// ---------------------------------------------------------------------------
// Admin (/api/admin/*)
// ---------------------------------------------------------------------------
export function getAdminOverview() {
  return api<AdminOverview>("/api/admin/overview");
}

export function listAdminBookings(params: {
  status?: BookingStatus;
  providerId?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.providerId) qs.set("providerId", params.providerId);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const suffix = qs.toString() ? `?${qs}` : "";
  return api<AdminBookingList>(`/api/admin/bookings${suffix}`);
}

export function patchAdminBooking(id: string, action: "cancel" | "refund") {
  return api<BookingAdmin>(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { action },
  });
}

export function listAdminProviders(params: { page?: number; pageSize?: number }) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const suffix = qs.toString() ? `?${qs}` : "";
  return api<AdminProviderList>(`/api/admin/providers${suffix}`);
}
