import type { NextFunction, Request, Response } from "express";
import { localeFromRequest } from "../i18n";

/**
 * Attach req.locale from X-Locale (then Accept-Language, fallback pt).
 * MUST be mounted BEFORE express.json() so body-parser errors localize.
 */
export function localeMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  req.locale = localeFromRequest({
    "x-locale": req.headers["x-locale"],
    "accept-language": req.headers["accept-language"],
  });
  next();
}
