import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "./env";
import { prisma } from "./prisma";

export interface AccessPayload {
  sub: string;
  role: Role;
  email: string;
}

const REFRESH_TTL_DAYS = 30;

export function signAccessToken(payload: AccessPayload): string {
  const opts = { expiresIn: env.ACCESS_TOKEN_TTL } as SignOptions;
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, opts);
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === "string") {
    throw new Error("Unexpected token payload");
  }
  return {
    sub: String(decoded.sub),
    role: decoded.role as Role,
    email: String(decoded.email),
  };
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function newRawToken(): string {
  // Opaque, high-entropy refresh token (the raw value is returned to the client;
  // only its SHA-256 hash is persisted).
  return crypto.randomBytes(48).toString("base64url");
}

/** Issue a brand-new refresh token + family (on login/register). */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = newRawToken();
  const family = crypto.randomUUID();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      family,
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return raw;
}

export interface RotateResult {
  userId: string;
  raw: string;
}

export type RotateError = "invalid" | "reused";

/**
 * Rotate a refresh token: validate it, revoke it, and mint a successor in the
 * same family. Reuse detection: presenting an already-revoked (but otherwise
 * valid) token revokes the entire family.
 *
 * Returns { ok:true, ...RotateResult } or { ok:false, reason }.
 */
export async function rotateRefreshToken(
  raw: string
): Promise<{ ok: true; result: RotateResult } | { ok: false; reason: RotateError }> {
  const tokenHash = sha256(raw);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    return { ok: false, reason: "invalid" };
  }

  // Reuse detection: a revoked token presented again → kill the whole family.
  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: existing.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: "reused" };
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: "invalid" };
  }

  const newRaw = newRawToken();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: sha256(newRaw),
        family: existing.family,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  return { ok: true, result: { userId: existing.userId, raw: newRaw } };
}

/** Revoke a single refresh token (logout). No-op if unknown. */
export async function revokeRefreshToken(raw: string): Promise<void> {
  const tokenHash = sha256(raw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function hashRefreshToken(raw: string): string {
  return sha256(raw);
}
