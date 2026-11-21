export const REQUEST_STATUSES = [
  'WAITING',
  'AVAILABLE',
  'CONTACTED',
  'RESERVED',
  'PURCHASED',
  'CANCELLED',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const ACTIVE_STATUSES: RequestStatus[] = [
  'WAITING',
  'AVAILABLE',
  'CONTACTED',
  'RESERVED',
];

export const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export const REQUEST_SOURCES = [
  'IN_STORE',
  'INSTAGRAM',
  'WHATSAPP',
  'PHONE',
  'OTHER',
] as const;

export const CUSTOMER_STATUSES = ['ACTIVE', 'VIP', 'INACTIVE'] as const;

// ---------------------------------------------------------------------------
// Subscriptions & billing
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = [
  'inactive',
  'pending',
  'active',
  'past_due',
  'cancelled',
  'expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['demo', 'stripe'] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const SUBSCRIPTION_PLAN_CODE = 'wishstock-pro';
export const SUBSCRIPTION_PRICE_KZT = 7_990;
export const SUBSCRIPTION_DURATION_DAYS = 30;
// Stripe amounts are in the smallest currency unit; KZT has 2 decimal places.
export const SUBSCRIPTION_PRICE_MINOR = SUBSCRIPTION_PRICE_KZT * 100;

export const PERMISSIONS: Record<Role, string[]> = {
  ADMIN: ['*'],
  MANAGER: [
    'dashboard:read',
    'products:read',
    'products:write',
    'products:delete',
    'requests:read',
    'requests:write',
    'requests:delete',
    'arrivals:read',
    'arrivals:write',
    'customers:read',
    'customers:write',
    'analytics:read',
    'notifications:read',
    'notifications:write',
    'settings:read',
    'settings:write',
    'audit:read',
  ],
  EMPLOYEE: [
    'dashboard:read',
    'products:read',
    'requests:read',
    'requests:write',
    'arrivals:read',
    'arrivals:write',
    'customers:read',
    'customers:write',
    'analytics:read',
    'notifications:read',
    'notifications:write',
    'settings:read',
  ],
};

export function can(role: Role, permission: string): boolean {
  const permissions = PERMISSIONS[role] ?? [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function availabilityFor(quantity: number, threshold: number): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}
