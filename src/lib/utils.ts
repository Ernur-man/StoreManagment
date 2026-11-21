import type { Availability, RequestStatus } from './types';
import { en, ru, type TranslationKey } from '../i18n/translations';
import type { Language } from '../i18n';

export function formatRelative(value: string | Date, language: Language): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  const dictionary = language === 'ru' ? ru : en;
  const key = (name: TranslationKey) => dictionary[name];
  if (minutes < 1) return key('time.justNow');
  if (minutes < 60) return key('time.minutesAgo').replace('{count}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return key('time.hoursAgo').replace('{count}', String(hours));
  return key('time.daysAgo').replace('{count}', String(Math.floor(hours / 24)));
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function isoDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function availabilityFor(quantity: number, threshold: number): Availability {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function whatsappHref(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}

export function exportCsv<T>(rows: T[], columns: Array<{ key: keyof T; label: string }>, filename: string) {
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    columns.map((c) => quote(c.label)).join(','),
    ...rows.map((row) => columns.map((c) => quote(row[c.key])).join(',')),
  ].join('\r\n');
  downloadFile(`${filename}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8;');
}

export function exportExcel<T>(rows: T[], columns: Array<{ key: keyof T; label: string }>, filename: string) {
  const cell = (value: unknown) => `<td>${String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)}</td>`;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table><thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => cell(r[c.key])).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  downloadFile(`${filename}.xls`, `\uFEFF${html}`, 'application/vnd.ms-excel;charset=utf-8;');
}

export const statusStyles: Record<RequestStatus, string> = {
  WAITING: 'bg-amber-50 text-amber-700 ring-amber-200',
  AVAILABLE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CONTACTED: 'bg-sky-50 text-sky-700 ring-sky-200',
  RESERVED: 'bg-violet-50 text-violet-700 ring-violet-200',
  PURCHASED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const statusDots: Record<RequestStatus, string> = {
  WAITING: 'bg-amber-500',
  AVAILABLE: 'bg-emerald-500',
  CONTACTED: 'bg-sky-500',
  RESERVED: 'bg-violet-500',
  PURCHASED: 'bg-indigo-500',
  CANCELLED: 'bg-slate-400',
};

export const availabilityStyles: Record<Availability, string> = {
  IN_STOCK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  LOW_STOCK: 'bg-amber-50 text-amber-700 ring-amber-200',
  OUT_OF_STOCK: 'bg-red-50 text-red-700 ring-red-200',
};

export const chartColors = ['#4f46e5', '#06b6d4', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#64748b'];

export function avatarColor(name: string): string {
  const colors = ['#4f46e5', '#0891b2', '#c026d3', '#ea580c', '#059669', '#7c3aed'];
  let hash = 0;
  for (const char of name) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
