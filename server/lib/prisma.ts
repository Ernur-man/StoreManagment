import { PrismaClient } from '@prisma/client';

/**
 * Vercel Functions are short-lived and may be warm-reused. A module-level
 * singleton (cached on globalThis in development) avoids exhausting the
 * Neon pooler's connection limit with one client per invocation.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
