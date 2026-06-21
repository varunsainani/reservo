import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./prisma";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Append an AuditLog row. Pass a transaction client to keep it atomic with the
 * surrounding mutation. Never throws into the caller's happy path.
 */
export async function audit(
  action: string,
  opts: {
    actorId?: string | null;
    meta?: Prisma.InputJsonValue;
    db?: Db;
  } = {}
): Promise<void> {
  const db = opts.db ?? defaultPrisma;
  try {
    await db.auditLog.create({
      data: {
        action,
        actorId: opts.actorId ?? null,
        meta: opts.meta ?? undefined,
      },
    });
  } catch {
    // Audit must never break the request it describes.
  }
}
