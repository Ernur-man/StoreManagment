import { describe, expect, it } from 'vitest';
import { en, ru, type TranslationKey } from './translations';

describe('translations', () => {
  it('has the same keys in English and Russian', () => {
    const enKeys = Object.keys(en).sort();
    const ruKeys = Object.keys(ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('has no empty translations', () => {
    const emptyEn = (Object.keys(en) as TranslationKey[]).filter((key) => !en[key].trim());
    const emptyRu = (Object.keys(ru) as TranslationKey[]).filter((key) => !ru[key].trim());
    expect(emptyEn).toEqual([]);
    expect(emptyRu).toEqual([]);
  });
});
