import { describe, expect, it } from 'vitest';
import {
  DemoCardValidationError,
  detectCardBrand,
  luhnValid,
  parseCardExpiry,
  parseDemoCard,
  type DemoCardInput,
} from './demoCard';

function futureExpiry(yearsAhead = 2): string {
  return `12/${String((new Date().getFullYear() + yearsAhead) % 100).padStart(2, '0')}`;
}

function validInput(overrides: Partial<DemoCardInput> = {}): DemoCardInput {
  return {
    number: '4242 4242 4242 4242',
    holderName: 'TEST USER',
    expiry: futureExpiry(),
    cvv: '123',
    ...overrides,
  };
}

describe('demo card validation', () => {
  it('detects only the two supported demo brands', () => {
    expect(detectCardBrand('4242424242424242')).toBe('Visa');
    expect(detectCardBrand('5555555555554444')).toBe('Mastercard');
    expect(detectCardBrand('2221000000000009')).toBe('Mastercard');
    expect(detectCardBrand('378282246310005')).toBeNull();
  });

  it('checks the Luhn checksum', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('5555555555554444')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
  });

  it('accepts valid demo cards and returns metadata only', () => {
    const card = parseDemoCard(validInput());
    expect(card).toEqual({
      brand: 'Visa',
      last4: '4242',
      holderName: 'TEST USER',
      expiryMonth: 12,
      expiryYear: new Date().getFullYear() + 2,
    });
    expect(Object.keys(card).sort()).toEqual(['brand', 'expiryMonth', 'expiryYear', 'holderName', 'last4']);
    expect(JSON.stringify(card)).not.toContain('4242 4242 4242 4242');
    expect(JSON.stringify(card)).not.toContain('123');
  });

  it('rejects invalid numbers, CVV, holder and expiry with fixed translation keys', () => {
    const cases: Array<[Partial<DemoCardInput>, string]> = [
      [{ number: '4242424242424241' }, 'billing.card.errors.invalidNumber'],
      [{ number: '378282246310005' }, 'billing.card.errors.invalidNumber'],
      [{ cvv: '12' }, 'billing.card.errors.invalidCvv'],
      [{ holderName: 'X1' }, 'billing.card.errors.invalidHolder'],
      [{ expiry: '13/29' }, 'billing.card.errors.invalidExpiry'],
      [{ expiry: '01/20' }, 'billing.card.errors.invalidExpiry'],
    ];
    for (const [overrides, key] of cases) {
      expect(() => parseDemoCard(validInput(overrides))).toThrowError(DemoCardValidationError);
      try {
        parseDemoCard(validInput(overrides));
      } catch (error) {
        expect((error as DemoCardValidationError).messageKey).toBe(key);
      }
    }
  });

  it('rejects an expiry date in the past', () => {
    const now = new Date();
    const pastMonth = now.getMonth() > 0 ? now.getMonth() : 12;
    const pastYear = now.getMonth() > 0 ? now.getFullYear() : now.getFullYear() - 1;
    expect(() =>
      parseCardExpiry(`${String(pastMonth).padStart(2, '0')}/${String(pastYear).slice(-2)}`, now),
    ).toThrowError(DemoCardValidationError);
  });
});
