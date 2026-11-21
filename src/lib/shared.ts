import type { Role } from './types';

export const REQUEST_STATUSES = ['WAITING', 'AVAILABLE', 'CONTACTED', 'RESERVED', 'PURCHASED', 'CANCELLED'] as const;
export const REQUEST_SOURCES = ['IN_STORE', 'INSTAGRAM', 'WHATSAPP', 'PHONE', 'OTHER'] as const;
export const AVAILABILITY_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;

/**
 * Client-side mirror of the server permission matrix. This only hides controls;
 * the server remains the authorization boundary.
 */
const PERMISSIONS: Record<Role, string[]> = {
  ADMIN: ['*'],
  MANAGER: [
    'dashboard:read', 'products:read', 'products:write', 'products:delete',
    'requests:read', 'requests:write', 'requests:delete',
    'arrivals:read', 'arrivals:write',
    'customers:read', 'customers:write',
    'analytics:read', 'notifications:read', 'notifications:write',
    'settings:read', 'settings:write', 'audit:read',
  ],
  EMPLOYEE: [
    'dashboard:read', 'products:read',
    'requests:read', 'requests:write',
    'arrivals:read', 'arrivals:write',
    'customers:read', 'customers:write',
    'analytics:read', 'notifications:read', 'notifications:write',
    'settings:read',
  ],
};

export function can(role: Role | undefined, permission: string): boolean {
  if (!role) return false;
  const permissions = PERMISSIONS[role] ?? [];
  return permissions.includes('*') || permissions.includes(permission);
}
