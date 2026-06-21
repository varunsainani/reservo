import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";
import { t, zodIssueMessage, DEFAULT_LOCALE } from "../i18n";

interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

/** Final error handler. Implements the SPEC error shape and localizes messages. */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // next is required for Express to treat this as an error handler.
  _next: NextFunction
): void {
  const locale = req.locale ?? DEFAULT_LOCALE;

  // ── Zod validation → 400 with per-field details ──────────────────────────
  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_";
      if (!details[path]) details[path] = zodIssueMessage(locale, issue);
    }
    res.status(400).json({
      error: {
        message: t(locale, "errors.common.validation"),
        code: "VALIDATION",
        details,
      },
    });
    return;
  }

  // ── HttpError → its status/code/localized message ────────────────────────
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        message: t(locale, err.messageKey, err.vars),
        ...(err.code ? { code: err.code } : {}),
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // ── body-parser errors (malformed / too large JSON) ──────────────────────
  const bpe = err as BodyParserError;
  const status = bpe?.status ?? bpe?.statusCode;
  if (bpe && (status === 400 || status === 413)) {
    if (status === 413 || bpe.type === "entity.too.large") {
      res.status(413).json({
        error: {
          message: t(locale, "errors.common.payloadTooLarge"),
          code: "PAYLOAD_TOO_LARGE",
        },
      });
      return;
    }
    res.status(400).json({
      error: {
        message: t(locale, "errors.common.malformedJson"),
        code: "MALFORMED_JSON",
      },
    });
    return;
  }

  // ── Anything else → 500, no internal leak ────────────────────────────────
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  res.status(500).json({
    error: {
      message: t(locale, "errors.common.internal"),
      code: "INTERNAL",
    },
  });
}

/** 404 handler (mounted after routes, before the error handler). */
export function notFoundMiddleware(req: Request, res: Response): void {
  const locale = req.locale ?? DEFAULT_LOCALE;
  res.status(404).json({
    error: {
      message: t(locale, "errors.common.notFound"),
      code: "NOT_FOUND",
    },
  });
}
