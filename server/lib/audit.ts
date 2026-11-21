import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthUser } from './auth.js';

type Db = Prisma.TransactionClient | PrismaClient;

export async function writeAudit(
  db: Db,
  user: AuthUser,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: unknown,
) {
  await db.auditLog.create({
    data: {
      storeId: user.storeId,
      userId: user.id,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details === undefined ? null : JSON.stringify(details),
    },
  });
}

export function generateNumber(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export function handlePrismaKnownError(error: unknown): { status: number; message: string } | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return { status: 409, message: 'errors.duplicate' };
    if (error.code === 'P2025') return { status: 404, message: 'errors.notFound' };
    if (error.code === 'P2003') return { status: 409, message: 'errors.referenced' };
  }
  return null;
}
