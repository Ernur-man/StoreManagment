import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { en, ru, type TranslationKey } from './translations';
import { td } from './data';

export type Language = 'en' | 'ru';
const STORAGE_KEY = 'wishstock-language';

type Params = Record<string, string | number>;

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: Params) => string;
  td: (value: string | null | undefined) => string;
  formatDate: (value: string | Date | null | undefined, withTime?: boolean) => string;
  formatNumber: (value: number) => string;
  formatMoney: (value: number, currency?: string) => string;
  error: (message?: string | null) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    params[key] === undefined ? match : String(params[key]),
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Render with a deterministic value on both server and client, then restore
  // the device preference after hydration. This preserves the UX without a
  // hydration mismatch in the Next.js App Router.
  const [language, setLanguageState] = useState<Language>('en');
  const hydrated = useRef(false);

  useEffect(() => {
    document.documentElement.lang = language;
    if (!hydrated.current) {
      hydrated.current = true;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'ru') setLanguageState('ru');
      } catch {
        /* storage may be unavailable in private mode */
      }
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* storage may be unavailable in private mode */
    }
  }, [language]);

  const setLanguage = useCallback((next: Language) => setLanguageState(next), []);
  const dictionary = language === 'ru' ? ru : en;

  const t = useCallback(
    (key: TranslationKey, params?: Params) => interpolate(dictionary[key] ?? key, params),
    [dictionary],
  );

  const translateData = useCallback((value: string | null | undefined) => td(value, language), [language]);

  const formatDate = useCallback(
    (value: string | Date | null | undefined, withTime = false) => {
      if (!value) return '—';
      const date = typeof value === 'string' ? new Date(value) : value;
      if (Number.isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(date);
    },
    [language],
  );

  const formatNumber = useCallback(
    (value: number) => new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-GB').format(value),
    [language],
  );

  const formatMoney = useCallback(
    (value: number, currency = 'USD') =>
      new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(value),
    [language],
  );

  const error = useCallback(
    (message?: string | null) => {
      if (!message) return t('errors.unknown');
      if (message in dictionary) return t(message as TranslationKey);
      return t('errors.validation');
    },
    [dictionary, t],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, td: translateData, formatDate, formatNumber, formatMoney, error }),
    [language, setLanguage, t, translateData, formatDate, formatNumber, formatMoney, error],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
