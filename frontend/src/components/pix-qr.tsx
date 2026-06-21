"use client";

import { useTranslations } from "next-intl";

// A mock Pix QR. The real backend returns a `pixQr` payload string; for the
// simulated provider it's a mock value, so we render a deterministic QR-like
// pattern derived from it (purely decorative — it is NOT a scannable code).
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function PixQrMock({ value, size = 168 }: { value: string; size?: number }) {
  const t = useTranslations("checkout");
  const grid = 21; // classic QR module count
  const cell = size / grid;
  const seed = hashString(value || "reservo-pix");

  // Deterministic PRNG.
  let state = seed || 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1000) / 1000;
  };

  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) =>
      r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, grid - 7) || inBox(grid - 7, 0);
  };
  const finderFilled = (r: number, c: number) => {
    const local = (br: number, bc: number) => {
      const rr = r - br;
      const cc = c - bc;
      if (rr === 0 || rr === 6 || cc === 0 || cc === 6) return true;
      if (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) return true;
      return false;
    };
    if (r < 7 && c < 7) return local(0, 0);
    if (r < 7 && c >= grid - 7) return local(0, grid - 7);
    if (r >= grid - 7 && c < 7) return local(grid - 7, 0);
    return false;
  };

  const cells: { x: number; y: number }[] = [];
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      let on: boolean;
      if (isFinder(r, c)) on = finderFilled(r, c);
      else on = rand() > 0.5;
      if (on) cells.push({ x: c * cell, y: r * cell });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-lg bg-white p-2 shadow-sm"
      role="img"
      aria-label={t("pixQrAlt")}
    >
      {cells.map((m, i) => (
        <rect key={i} x={m.x} y={m.y} width={cell} height={cell} fill="#0a0a0a" />
      ))}
    </svg>
  );
}
