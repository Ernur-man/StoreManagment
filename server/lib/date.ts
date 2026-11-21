const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses date inputs from filters. Date-only values are treated as UTC calendar
 * days; full timestamps are kept as exact instants. Returns null for invalid
 * input so callers can ignore bad filters instead of sending Invalid Date to
 * Prisma.
 */
export function parseDateBoundary(value: string, endOfDay: boolean): Date | null {
  const isDateOnly = DATE_ONLY.test(value);
  const date = isDateOnly ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (isDateOnly && endOfDay) {
    date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCMilliseconds(-1);
  }
  return date;
}
