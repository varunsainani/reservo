import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./lib/env";
import { localeMiddleware } from "./middleware/locale";
import { attachAuth } from "./middleware/auth";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error";
import { buildRouter } from "./routes";

export function createApp(): Express {
  const app = express();

  // Behind Vercel/Neon proxies — trust the proxy for correct req.ip / protocol.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());

  // CORS from env. In prod this is never "*" (env layer falls back to APP_URL).
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Locale", "x-cron-secret", "x-simulated-token", "x-signature", "x-request-id"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  );

  // Locale BEFORE body parsing, so body-parser errors localize.
  app.use(localeMiddleware);

  // JSON body parsing with a sane limit.
  app.use(express.json({ limit: "256kb" }));

  // Parse Bearer token (anonymous-friendly).
  app.use(attachAuth);

  // Health check.
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "reservo", time: new Date().toISOString() });
  });

  // API.
  app.use("/api", buildRouter());

  // 404 + error handlers (error handler MUST be last).
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
