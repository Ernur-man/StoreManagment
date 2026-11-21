import { prisma } from './prisma.js';

/**
 * Resolves a client-supplied employee ID inside the authenticated store.
 * Returns null for an unknown, inactive or cross-store user so callers can
 * reject the request instead of attributing a record to another tenant.
 */
export async function resolveStoreEmployeeId(
  storeId: string,
  employeeId: string | null | undefined,
  fallbackUserId: string,
): Promise<string | null> {
  if (!employeeId || employeeId === fallbackUserId) return fallbackUserId;
  const employee = await prisma.user.findFirst({
    where: { id: employeeId, storeId, active: true },
    select: { id: true },
  });
  return employee?.id ?? null;
}
