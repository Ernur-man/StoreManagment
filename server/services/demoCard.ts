/**
 * DEMO CARD VAULT — validation and metadata-only persistence.
 *
 * The PAN and CVV exist only as local variables inside parseDemoCard() during a
 * request. They are never stored, returned, serialized into an error or logged.
 * The database record contains brand, last4, holder name and expiry only, and
 * is explicitly a demo artifact — not a bank card token or payment credential.
 */
import type { AuthUser } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

export type DemoCardBrand = 'Visa' | 'Mastercard';

export interface DemoCardInput {
  number: string;
  holderName: string;
  expiry: string;
  cvv: string;
}

export interface DemoCardMetadata {
  brand: DemoCardBrand;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface DemoCardView extends DemoCardMetadata {
  id: string;
  masked: string;
  createdAt: string;
  updatedAt: string;
}

export class DemoCardValidationError extends Error {
  readonly messageKey: string;

  constructor(messageKey: string) {
    super(messageKey);
    this.name = 'DemoCardValidationError';
    this.messageKey = messageKey;
  }
}

const fail = (key: string): never => {
  throw new DemoCardValidationError(key);
};

/** Published, non-real test numbers only. Real PANs are never accepted. */
const DEMO_TEST_PANS = new Set([
  '4242424242424242',
  '4000000000000002',
  '5555555555554444',
  '2221000000000009',
]);

/** Removes the only formatting accepted in the demo form: spaces and dashes. */
export function normalizeCardNumber(value: string): string {
  return value.replace(/[\s-]/g, '');
}

/** Detects the two demo-supported brands from the PAN prefix and length. */
export function detectCardBrand(number: string): DemoCardBrand | null {
  if (/^4\d{12}(?:\d{3}){0,2}$/.test(number)) return 'Visa';
  if (/^5[1-5]\d{14}$/.test(number)) return 'Mastercard';
  if (/^2\d{15}$/.test(number)) {
    const prefix = Number(number.slice(0, 4));
    if (prefix >= 2221 && prefix <= 2720) return 'Mastercard';
  }
  return null;
}

/** Standard Luhn checksum. Operates on a transient in-memory PAN only. */
export function luhnValid(number: string): boolean {
  if (!/^\d{12,19}$/.test(number)) return false;
  let sum = 0;
  let double = false;
  for (let index = number.length - 1; index >= 0; index -= 1) {
    let digit = number.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Accepts MM/YY or MM/YYYY; rejects past and implausibly distant dates. */
export function parseCardExpiry(value: string, now: Date = new Date()): Pick<DemoCardMetadata, 'expiryMonth' | 'expiryYear'> {
  const match = /^(\d{1,2})\s*[/-]\s*(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) return fail('billing.card.errors.invalidExpiry');

  const month = Number(match[1]);
  const rawYear = Number(match[2]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (month < 1 || month > 12) return fail('billing.card.errors.invalidExpiry');
  if (year < now.getFullYear() || year > now.getFullYear() + 20) return fail('billing.card.errors.invalidExpiry');
  if (year === now.getFullYear() && month < now.getMonth() + 1) return fail('billing.card.errors.expired');

  return { expiryMonth: month, expiryYear: year };
}

/**
 * Converts form input into the only values allowed to leave this function.
 * Throws translation-key errors so no PAN, holder value or CVV is echoed.
 */
export function parseDemoCard(input: DemoCardInput): DemoCardMetadata {
  const number = normalizeCardNumber(input.number);
  if (!DEMO_TEST_PANS.has(number) || !detectCardBrand(number) || !luhnValid(number)) {
    return fail('billing.card.errors.invalidNumber');
  }

  const cvv = input.cvv.trim();
  if (!/^\d{3}$/.test(cvv)) return fail('billing.card.errors.invalidCvv');

  const holderName = input.holderName.trim().replace(/\s+/g, ' ');
  if (
    holderName.length < 2 ||
    holderName.length > 60 ||
    !/^[\p{L}\s.'-]+$/u.test(holderName)
  ) {
    return fail('billing.card.errors.invalidHolder');
  }

  const expiry = parseCardExpiry(input.expiry);
  return {
    brand: detectCardBrand(number)!,
    last4: number.slice(-4),
    holderName,
    ...expiry,
  };
}

function toView(card: {
  id: string;
  brand: string;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  createdAt: Date;
  updatedAt: Date;
}): DemoCardView {
  return {
    id: card.id,
    // Values are written only by parseDemoCard(), so this is a safe narrowing.
    brand: card.brand as DemoCardBrand,
    last4: card.last4,
    holderName: card.holderName,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    masked: `${card.brand} •••• ${card.last4}`,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

export async function getDemoCard(user: AuthUser): Promise<DemoCardView | null> {
  const card = await prisma.demoCard.findUnique({
    where: { storeId_userId: { storeId: user.storeId, userId: user.id } },
  });
  return card ? toView(card) : null;
}

/** Adds or replaces the user's demo card. Only metadata reaches Prisma. */
export async function saveDemoCard(user: AuthUser, input: DemoCardInput): Promise<DemoCardView> {
  const metadata = parseDemoCard(input);
  const card = await prisma.demoCard.upsert({
    where: { storeId_userId: { storeId: user.storeId, userId: user.id } },
    create: { storeId: user.storeId, userId: user.id, ...metadata },
    update: metadata,
  });
  return toView(card);
}

/** Deletes only the authenticated user's own demo card. */
export async function deleteDemoCard(user: AuthUser): Promise<void> {
  await prisma.demoCard.deleteMany({ where: { storeId: user.storeId, userId: user.id } });
}
