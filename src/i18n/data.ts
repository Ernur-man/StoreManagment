import type { Language } from './index';

const productNames: Record<string, Record<Language, string>> = {
  'Black Skirt': { en: 'Black Skirt', ru: 'Чёрная юбка' },
  'White Shirt': { en: 'White Shirt', ru: 'Белая рубашка' },
  'Blue Jeans': { en: 'Blue Jeans', ru: 'Синие джинсы' },
  'Beige Jacket': { en: 'Beige Jacket', ru: 'Бежевый жакет' },
  'Black Dress': { en: 'Black Dress', ru: 'Чёрное платье' },
  'Cotton T-Shirt': { en: 'Cotton T-Shirt', ru: 'Хлопковая футболка' },
  'Wool Coat': { en: 'Wool Coat', ru: 'Шерстяное пальто' },
  'Smoke Test Skirt': { en: 'Smoke Test Skirt', ru: 'Тестовая юбка' },
};

const categories: Record<string, Record<Language, string>> = {
  Skirts: { en: 'Skirts', ru: 'Юбки' },
  Tops: { en: 'Tops', ru: 'Верх' },
  Bottoms: { en: 'Bottoms', ru: 'Низ' },
  Outerwear: { en: 'Outerwear', ru: 'Верхняя одежда' },
  Dresses: { en: 'Dresses', ru: 'Платья' },
  Uncategorized: { en: 'Uncategorized', ru: 'Без категории' },
};

const colors: Record<string, Record<Language, string>> = {
  Black: { en: 'Black', ru: 'Чёрный' },
  White: { en: 'White', ru: 'Белый' },
  Blue: { en: 'Blue', ru: 'Синий' },
  Beige: { en: 'Beige', ru: 'Бежевый' },
  Grey: { en: 'Grey', ru: 'Серый' },
};

/** Translate known demo/data values; pass through user-generated content. */
export function td(value: string | null | undefined, language: Language): string {
  if (!value) return '';
  const key = String(value);
  return productNames[key]?.[language] ?? categories[key]?.[language] ?? colors[key]?.[language] ?? key;
}
