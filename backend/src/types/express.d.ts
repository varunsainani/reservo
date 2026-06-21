import type { Role } from "@prisma/client";
import type { Locale } from "../i18n";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      locale: Locale;
      auth?: {
        userId: string;
        role: Role;
        email: string;
      };
    }
  }
}

export {};
