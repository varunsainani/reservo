import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyAccessToken } from "../lib/tokens";
import { httpError } from "../lib/http-error";

/** Parse a Bearer token if present; populate req.auth. Never throws. */
export function attachAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = verifyAccessToken(token);
      req.auth = {
        userId: payload.sub,
        role: payload.role,
        email: payload.email,
      };
    } catch {
      // Invalid/expired token → treated as anonymous; guarded routes will 401.
    }
  }
  next();
}

/** Require a valid access token. */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    throw httpError(401, "errors.auth.tokenMissing", { code: "UNAUTHORIZED" });
  }
  next();
}

/** Require one of the given roles (implies requireAuth). */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw httpError(401, "errors.auth.tokenMissing", { code: "UNAUTHORIZED" });
    }
    if (!roles.includes(req.auth.role)) {
      throw httpError(403, "errors.auth.forbiddenRole", { code: "FORBIDDEN" });
    }
    next();
  };
}
