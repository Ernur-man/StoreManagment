/**
 * Normalisation used by the automatic matching engine.
 * Stable across SKUs, sizes and colours entered with different casing,
 * whitespace, dashes or underscores.
 */
export function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/\\.,]+/g, '');
}

export function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/[^\d+]/g, '');
}

export function matchesVariant(
  request: { sku: string; size: string; color: string },
  arrival: { skus: string[]; size: string; color: string },
): boolean {
  const skuMatch = arrival.skus.some(
    (candidate) => normalize(candidate) === normalize(request.sku),
  );
  return (
    skuMatch &&
    normalize(request.size) === normalize(arrival.size) &&
    normalize(request.color) === normalize(arrival.color)
  );
}
