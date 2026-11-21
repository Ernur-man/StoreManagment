import { z } from 'zod';
import {
  PAYMENT_PROVIDERS,
  REQUEST_SOURCES,
  REQUEST_STATUSES,
  ROLES,
  SUBSCRIPTION_PLAN_CODE,
  SUBSCRIPTION_STATUSES,
} from './constants.js';

const text = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 1000) => z.string().trim().max(max).optional().nullable();
const date = z.coerce.date();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8).max(100),
});

export const productSchema = z.object({
  name: text(120),
  sku: text(60),
  category: text(80),
  brand: optionalText(80),
  description: optionalText(1000),
  imageUrl: optionalText(500),
  isActive: z.boolean().optional().default(true),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        sku: text(60),
        size: text(30),
        color: text(40),
        price: z.coerce.number().min(0).max(1_000_000),
        imageUrl: optionalText(500),
        lowStockThreshold: z.coerce.number().int().min(0).max(1000).optional().default(3),
        quantity: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
      }),
    )
    .min(1)
    .max(30),
});

export const requestSchema = z.object({
  customerName: text(120),
  phone: text(40),
  productName: text(120),
  sku: text(60),
  category: optionalText(80),
  size: text(30),
  color: text(40),
  source: z.enum(REQUEST_SOURCES).optional().default('IN_STORE'),
  notes: optionalText(1000),
  requestDate: date.optional(),
  employeeId: z.string().optional().nullable(),
});

export const requestStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
});

export const arrivalSchema = z.object({
  sku: text(60),
  productName: text(120),
  size: text(30),
  color: text(40),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unitCost: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  supplier: optionalText(120),
  notes: optionalText(1000),
  arrivalDate: date.optional(),
  employeeId: z.string().optional().nullable(),
});

export const customerSchema = z.object({
  name: text(120),
  phone: text(40),
  email: z.union([z.string().trim().email().max(150), z.literal('')]).optional(),
  notes: optionalText(1000),
  status: z.enum(['ACTIVE', 'VIP', 'INACTIVE']).optional().default('ACTIVE'),
});

export const userSchema = z.object({
  name: text(120),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8).max(100).optional(),
  role: z.enum(ROLES).optional().default('EMPLOYEE'),
  active: z.boolean().optional().default(true),
});

export const settingsSchema = z.object({
  name: text(120),
  currency: text(10),
  address: optionalText(300),
  phone: optionalText(40),
  email: optionalText(150),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000),
});

export const adjustInventorySchema = z.object({
  quantity: z.coerce.number().int().min(0).max(1_000_000),
});

// ---------------------------------------------------------------------------
// Subscriptions & billing — clients may only request a checkout, never set a
// subscription status or a payment result.
// ---------------------------------------------------------------------------

export const checkoutSchema = z.object({
  planCode: z.literal(SUBSCRIPTION_PLAN_CODE).optional().default(SUBSCRIPTION_PLAN_CODE),
  provider: z.enum(PAYMENT_PROVIDERS).optional(),
});

export const demoConfirmSchema = z.object({
  token: text(2000),
  outcome: z.enum(['success', 'failure', 'cancel']),
});

/**
 * DEMO CARD. Errors use stable translation keys and never echo the submitted
 * value, so a card number or CVV cannot leak into an error response.
 */
export const demoCardSchema = z.object({
  number: z.string().trim().min(12, 'billing.card.errors.invalidNumber').max(23, 'billing.card.errors.invalidNumber'),
  holderName: z.string().trim().min(2, 'billing.card.errors.invalidHolder').max(60, 'billing.card.errors.invalidHolder'),
  expiry: z.string().trim().min(4, 'billing.card.errors.invalidExpiry').max(7, 'billing.card.errors.invalidExpiry'),
  cvv: z.string().trim().min(3, 'billing.card.errors.invalidCvv').max(4, 'billing.card.errors.invalidCvv'),
});

export const adminSubscriptionStatusSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES),
  expiresAt: z.coerce.date().optional().nullable(),
  startedAt: z.coerce.date().optional().nullable(),
  reason: optionalText(300),
});

export const adminGrantSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(150),
  status: z.enum(['active', 'pending', 'cancelled', 'expired']).optional().default('active'),
  durationDays: z.coerce.number().int().min(1).max(365).optional().default(30),
});

export const webhookEnvelopeSchema = z.object({
  id: text(200),
  type: text(120),
  transactionId: text(100).optional(),
  providerPaymentId: text(200).optional(),
  data: z
    .object({
      transactionId: text(100).optional(),
      providerPaymentId: text(200).optional(),
      paymentStatus: text(60).optional(),
      amountMinor: z.coerce.number().int().optional(),
      currency: text(10).optional(),
      reason: optionalText(300),
    })
    .optional(),
});

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export function firstZodMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Invalid input';
  }
  return 'Invalid input';
}
