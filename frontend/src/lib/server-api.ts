// ---------------------------------------------------------------------------
// Server-side API helpers for Server Components. Forwards X-Locale from the
// NEXT_LOCALE cookie. CRUCIALLY: every helper degrades to null on ANY failure
// (network, non-2xx, missing backend) so prerender/build NEVER hard-fails when
// the backend is absent. Pages render a graceful fallback / notFound() instead.
// ---------------------------------------------------------------------------
import { cookies } from "next/headers";
import type { ProviderListResponse, ProviderDetail } from "./api-types";

// Server-side, the rewrite isn't applied to absolute fetches, so we hit the
// backend directly via API_PROXY_TARGET. Falls back to localhost for dev.
const BACKEND = process.env.API_PROXY_TARGET || "http://localhost:4000";

async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const locale = (await cookies()).get("NEXT_LOCALE")?.value;
    const headers: Record<string, string> = {};
    if (locale) headers["X-Locale"] = locale;

    const res = await fetch(`${BACKEND}${path}`, {
      headers,
      // Always request-time: never cache at build, and never block a build on a
      // missing backend.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchProviders(params: {
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
  return serverGet<ProviderListResponse>(`/api/providers${suffix}`);
}

export function fetchProvider(slug: string) {
  return serverGet<ProviderDetail>(`/api/providers/${encodeURIComponent(slug)}`);
}
