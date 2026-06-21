import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { httpError } from "../lib/http-error";
import { audit } from "../lib/audit";
import { serializeUser } from "../lib/serialize";
import { uniqueSlug } from "../lib/slug";
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from "../lib/tokens";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "../lib/validation";

const BCRYPT_ROUNDS = 10;

export async function register(req: Request, res: Response): Promise<void> {
  const body = registerSchema.parse(req.body);

  // Defensive: schema already forbids ADMIN, but make the intent explicit.
  if ((body.role as string) === "ADMIN") {
    throw httpError(403, "errors.auth.cannotRegisterAdmin", {
      code: "CANNOT_REGISTER_ADMIN",
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) {
    throw httpError(409, "errors.auth.emailTaken", { code: "EMAIL_TAKEN" });
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role as Role,
      },
    });

    if (body.role === "PROVIDER") {
      const slug = await uniqueSlug(body.name, async (s) => {
        const found = await tx.provider.findUnique({
          where: { slug: s },
          select: { id: true },
        });
        return !!found;
      });
      await tx.provider.create({
        data: {
          userId: u.id,
          slug,
          name: body.name,
          category: "",
          timezone: "America/Sao_Paulo",
        },
      });
    }

    return u;
  });

  await audit("auth.register", { actorId: user.id, meta: { role: user.role } });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = await issueRefreshToken(user.id);

  res.status(201).json({ user: serializeUser(user), accessToken, refreshToken });
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Constant-ish work whether or not the user exists (avoid trivial enumeration).
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv";
  const valid = await bcrypt.compare(body.password, hash);

  if (!user || !valid) {
    throw httpError(401, "errors.auth.invalidCredentials", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = await issueRefreshToken(user.id);

  res.status(200).json({ user: serializeUser(user), accessToken, refreshToken });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const body = refreshSchema.parse(req.body);
  const result = await rotateRefreshToken(body.refreshToken);

  if (!result.ok) {
    if (result.reason === "reused") {
      throw httpError(401, "errors.auth.refreshReused", {
        code: "REFRESH_REUSED",
      });
    }
    throw httpError(401, "errors.auth.refreshInvalid", {
      code: "REFRESH_INVALID",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: result.result.userId },
  });
  if (!user) {
    throw httpError(401, "errors.auth.refreshInvalid", {
      code: "REFRESH_INVALID",
    });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  res.status(200).json({ accessToken, refreshToken: result.result.raw });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const body = logoutSchema.parse(req.body);
  await revokeRefreshToken(body.refreshToken);
  res.status(200).json({ ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    throw httpError(401, "errors.auth.tokenInvalid", { code: "UNAUTHORIZED" });
  }
  res.status(200).json({ user: serializeUser(user) });
}
