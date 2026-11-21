import { describe, expect, it } from 'vitest';
import { matchesVariant, normalize, normalizePhone } from './normalize';

describe('normalize', () => {
  it('ignores case, trimming and separators', () => {
    expect(normalize(' SKU-12/34 ')).toBe('sku1234');
    expect(normalize('sku_12\\34')).toBe('sku1234');
    expect(normalize('sku.12,34')).toBe('sku1234');
  });

  it('keeps phone digits and leading plus', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('(415) 555-0134')).toBe('4155550134');
  });
});

describe('matchesVariant', () => {
  const request = { sku: 'SK-14', size: ' M ', color: 'Black' };
  const arrival = { skus: ['sk_14', 'OTHER'], size: 'm', color: ' black ' };

  it('matches the same SKU, size and color despite formatting differences', () => {
    expect(matchesVariant(request, arrival)).toBe(true);
  });

  it('does not match a different size or color', () => {
    expect(matchesVariant(request, { ...arrival, size: 'L' })).toBe(false);
    expect(matchesVariant(request, { ...arrival, color: 'White' })).toBe(false);
  });

  it('does not match an unrelated SKU', () => {
    expect(matchesVariant(request, { ...arrival, skus: ['OTHER'] })).toBe(false);
  });
});
