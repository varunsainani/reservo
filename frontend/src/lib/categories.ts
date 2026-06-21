// Known provider categories. The backend stores a free-string category; we map
// the known ones to i18n keys and fall back to "other" for anything unmapped.
export const KNOWN_CATEGORIES = ["health", "beauty", "consulting", "fitness", "other"] as const;
export type KnownCategory = (typeof KNOWN_CATEGORIES)[number];

export function categoryKey(value: string | null | undefined): KnownCategory {
  const v = (value || "").toLowerCase();
  if ((KNOWN_CATEGORIES as readonly string[]).includes(v)) return v as KnownCategory;
  // Tolerant matching for common synonyms the seed might use.
  if (/health|clinic|medic|saúde|saude|salud/.test(v)) return "health";
  if (/beauty|salon|salão|salao|belleza|beleza/.test(v)) return "beauty";
  if (/consult/.test(v)) return "consulting";
  if (/fitness|gym|studio|estúdio|estudio/.test(v)) return "fitness";
  return "other";
}
