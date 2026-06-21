import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./money";

export const emailSchema = z.string().trim().toLowerCase().email().max(200);
export const passwordSchema = z.string().min(8).max(200);
export const nameSchema = z.string().trim().min(1).max(120);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  role: z.enum(["CUSTOMER", "PROVIDER"]),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(500),
});

export const logoutSchema = refreshSchema;

const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid datetime");

const dateYMD = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const createBookingSchema = z.object({
  providerSlug: z.string().trim().min(1).max(120),
  serviceId: z.string().trim().min(1).max(60),
  startsAt: isoDateTime,
  customer: z.object({
    name: nameSchema,
    email: emailSchema,
    phone: z.string().trim().max(40).optional(),
  }),
  notes: z.string().trim().max(1000).optional(),
});

export const simulatePaymentSchema = z.object({
  bookingId: z.string().trim().min(1).max(60),
  token: z.string().trim().min(1).max(200),
  outcome: z.enum(["approved", "rejected"]),
  method: z.enum(["PIX", "CARD"]).optional(),
});

const currencyEnum = z.enum(SUPPORTED_CURRENCIES);

export const serviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  durationMin: z.number().int().min(5).max(24 * 60),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: currencyEnum.default("BRL"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const serviceUpdateSchema = serviceSchema.partial();

export const updateProviderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only")
    .optional(),
  bio: z.string().trim().max(2000).default(""),
  category: z.string().trim().max(60).default(""),
  timezone: z.string().trim().min(1).max(60),
  city: z.string().trim().max(120).default(""),
  region: z.string().trim().max(120).default(""),
  country: z.string().trim().max(120).default(""),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  avatarUrl: z.string().trim().url().max(500).optional().nullable(),
});

const availabilityRuleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(24 * 60),
    endMinute: z.number().int().min(0).max(24 * 60),
  })
  .refine((r) => r.endMinute > r.startMinute, {
    message: "endMinute must be greater than startMinute",
    path: ["endMinute"],
  });

export const availabilitySchema = z.object({
  rules: z.array(availabilityRuleSchema).max(200),
});

export const blockSchema = z
  .object({
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    reason: z.string().trim().max(200).optional().nullable(),
  })
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const providerBookingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("reschedule"), startsAt: isoDateTime }),
]);

export const adminBookingActionSchema = z.object({
  action: z.enum(["cancel", "refund"]),
});

export const availabilityQuerySchema = z.object({
  serviceId: z.string().trim().min(1).max(60),
  date: dateYMD,
});

export { dateYMD, isoDateTime };
