import dotenv from "dotenv";

dotenv.config();

function asString(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    return "";
  }
  return v;
}

function asInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = asString("NODE_ENV", "development");
const isProd = NODE_ENV === "production";

// JWT secret: REQUIRED to be strong in production, fail-fast there.
const rawJwtSecret = asString("JWT_ACCESS_SECRET");
if (isProd && (!rawJwtSecret || rawJwtSecret.length < 16)) {
  throw new Error(
    "JWT_ACCESS_SECRET must be set to a strong value in production (>= 16 chars)."
  );
}
const JWT_ACCESS_SECRET =
  rawJwtSecret || "dev-insecure-jwt-secret-change-me-in-production";

// ACCESS_TOKEN_TTL: must be a vercel/ms-style duration (e.g. 30m, 1h, 900).
const ACCESS_TOKEN_TTL = asString("ACCESS_TOKEN_TTL", "30m");
if (!/^\d+(\.\d+)?\s*(ms|s|m|h|d|w|y)?$/.test(ACCESS_TOKEN_TTL.trim())) {
  throw new Error(
    `ACCESS_TOKEN_TTL is invalid: "${ACCESS_TOKEN_TTL}". Use a value like "30m", "1h", or "900".`
  );
}

const APP_URL = asString("APP_URL", "http://localhost:3000").replace(/\/+$/, "");

// CORS: never wildcard in production, but be NON-FATAL — warn and fall back to APP_URL.
const rawCors = asString("CORS_ORIGIN", "*");
let corsOrigins: string[] | "*";
if (rawCors === "*") {
  if (isProd) {
    // eslint-disable-next-line no-console
    console.warn(
      "[env] CORS_ORIGIN is '*' in production; falling back to APP_URL to avoid a wide-open CORS policy."
    );
    corsOrigins = [APP_URL];
  } else {
    corsOrigins = "*";
  }
} else {
  corsOrigins = rawCors
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (corsOrigins.length === 0) corsOrigins = isProd ? [APP_URL] : "*";
}

const PAYMENT_PROVIDER = (
  asString("PAYMENT_PROVIDER", "simulated").toLowerCase() === "mercadopago"
    ? "mercadopago"
    : "simulated"
) as "simulated" | "mercadopago";

// Webhook/cron secrets: REQUIRED to be real in production, fail-fast there.
// Mirrors the JWT_ACCESS_SECRET prod guard. Dev defaults are kept for dev.
const DEV_SIMULATED_WEBHOOK_TOKEN = "dev-simulated-token";
const DEV_CRON_SECRET = "dev-cron-secret";

const rawSimulatedToken = asString("SIMULATED_WEBHOOK_TOKEN");
if (
  isProd &&
  PAYMENT_PROVIDER === "simulated" &&
  (!rawSimulatedToken || rawSimulatedToken === DEV_SIMULATED_WEBHOOK_TOKEN)
) {
  throw new Error(
    "SIMULATED_WEBHOOK_TOKEN must be set to a real value in production (not the dev default) when PAYMENT_PROVIDER=simulated."
  );
}

const rawCronSecret = asString("CRON_SECRET");
if (isProd && (!rawCronSecret || rawCronSecret === DEV_CRON_SECRET)) {
  throw new Error(
    "CRON_SECRET must be set to a real value in production (not the dev default)."
  );
}

export const env = {
  NODE_ENV,
  isProd,
  PORT: asInt("PORT", 4000),

  DATABASE_URL: asString("DATABASE_URL"),
  DIRECT_URL: asString("DIRECT_URL"),

  JWT_ACCESS_SECRET,
  ACCESS_TOKEN_TTL: ACCESS_TOKEN_TTL.trim(),

  PAYMENT_PROVIDER,
  SIMULATED_WEBHOOK_TOKEN: rawSimulatedToken || DEV_SIMULATED_WEBHOOK_TOKEN,
  HOLD_MINUTES: asInt("HOLD_MINUTES", 15),

  MERCADOPAGO_ACCESS_TOKEN: asString("MERCADOPAGO_ACCESS_TOKEN"),
  MERCADOPAGO_WEBHOOK_SECRET: asString("MERCADOPAGO_WEBHOOK_SECRET"),

  APP_URL,
  CORS_ORIGIN: corsOrigins,
  CRON_SECRET: rawCronSecret || DEV_CRON_SECRET,

  // Optional email
  BREVO_API_KEY: asString("BREVO_API_KEY"),
  BREVO_SENDER_EMAIL: asString("BREVO_SENDER_EMAIL"),
  BREVO_SENDER_NAME: asString("BREVO_SENDER_NAME"),
  SMTP_HOST: asString("SMTP_HOST"),
  SMTP_PORT: asString("SMTP_PORT"),
  SMTP_USER: asString("SMTP_USER"),
  SMTP_PASS: asString("SMTP_PASS"),
  SMTP_FROM: asString("SMTP_FROM"),
};

export type Env = typeof env;
