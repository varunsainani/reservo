import crypto from "crypto";

/** Slugify a name into a URL-safe handle (accent-stripped, lowercase). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Build a slug guaranteed unique against `exists`. Appends a short suffix. */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  let candidate = slugify(base) || "provider";
  if (!(await exists(candidate))) return candidate;
  for (let i = 0; i < 50; i++) {
    const suffix = crypto.randomBytes(2).toString("hex");
    candidate = `${slugify(base) || "provider"}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Extremely unlikely fallback.
  return `${slugify(base) || "provider"}-${crypto.randomUUID().slice(0, 8)}`;
}

/** A public, unguessable booking token. */
export function publicToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}
