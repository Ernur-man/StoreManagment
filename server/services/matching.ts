import { prisma } from '../lib/prisma.js';
import { matchesVariant, normalize } from '../lib/normalize.js';
import { generateNumber, writeAudit } from '../lib/audit.js';
import type { AuthUser } from '../lib/auth.js';
import { queueArrivalEmailNotifications } from './arrivalEmail.js';

export interface RegisterArrivalInput {
  sku: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  unitCost?: number | null;
  supplier?: string | null;
  notes?: string | null;
  arrivalDate?: Date;
  employeeId?: string | null;
}

/**
 * Registers a stock arrival and performs automatic request matching in one
 * database transaction. Inventory changes, request status changes, notifications
 * and audit records either all commit or all roll back.
 */
export async function registerArrival(input: RegisterArrivalInput, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: user.storeId } });
    if (!store) throw new Error('STORE_NOT_FOUND');

    // Resolve product: exact SKU first, then a variant SKU, otherwise create it.
    const products = await tx.product.findMany({
      where: { storeId: user.storeId },
      select: { id: true, sku: true },
    });
    let productId = products.find((p) => normalize(p.sku) === normalize(input.sku))?.id;

    if (!productId) {
      const variant = await tx.productVariant.findFirst({
        where: { storeId: user.storeId, sku: input.sku },
        select: { productId: true },
      });
      productId = variant?.productId;
    }

    let productSku = input.sku;
    if (!productId) {
      const product = await tx.product.create({
        data: {
          storeId: user.storeId,
          name: input.productName,
          sku: input.sku,
          category: 'Uncategorized',
        },
      });
      productId = product.id;
    } else {
      const existing = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      productSku = existing.sku;
    }

    const variants = await tx.productVariant.findMany({
      where: { storeId: user.storeId },
      select: { id: true, sku: true, size: true, color: true },
    });
    let variant = variants.find(
      (candidate) =>
        normalize(candidate.sku) === normalize(input.sku) &&
        normalize(candidate.size) === normalize(input.size) &&
        normalize(candidate.color) === normalize(input.color),
    );
    if (!variant) {
      let variantSku = input.sku;
      if (variants.some((candidate) => normalize(candidate.sku) === normalize(input.sku))) {
        variantSku = `${input.sku}-${input.size}-${input.color}`.replace(/\s+/g, '-').toUpperCase();
        let suffix = 2;
        while (variants.some((candidate) => normalize(candidate.sku) === normalize(variantSku))) {
          variantSku = `${input.sku}-${input.size}-${input.color}-${suffix}`.replace(/\s+/g, '-').toUpperCase();
          suffix += 1;
        }
      }
      variant = await tx.productVariant.create({
        data: {
          storeId: user.storeId,
          productId,
          sku: variantSku,
          size: input.size,
          color: input.color,
          // unitCost is an arrival cost, never the retail price.
          price: 0,
          lowStockThreshold: store.lowStockThreshold,
        },
      });
    }

    const inventoryBefore = await tx.inventory.findUnique({ where: { variantId: variant.id } });
    const inventory = await tx.inventory.upsert({
      where: { variantId: variant.id },
      create: {
        storeId: user.storeId,
        variantId: variant.id,
        quantity: input.quantity,
      },
      update: { quantity: { increment: input.quantity } },
    });

    const waiting = await tx.customerRequest.findMany({
      where: { storeId: user.storeId, status: 'WAITING' },
      include: { customer: true, matches: true },
    });

    const skuCandidates = Array.from(new Set([input.sku, productSku, variant.sku]));
    const candidates = waiting.filter(
      (request) =>
        request.matches.length === 0 &&
        matchesVariant(request, {
          skus: skuCandidates,
          size: input.size,
          color: input.color,
        }),
    );

    const arrival = await tx.stockArrival.create({
      data: {
        storeId: user.storeId,
        arrivalNumber: generateNumber('ARR'),
        supplier: input.supplier || null,
        notes: input.notes || null,
        arrivalDate: input.arrivalDate ?? new Date(),
        employeeId: input.employeeId || user.id,
      },
    });

    const item = await tx.stockArrivalItem.create({
      data: {
        arrivalId: arrival.id,
        variantId: variant.id,
        productName: input.productName,
        sku: input.sku,
        size: input.size,
        color: input.color,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
      },
    });

    const matchedRequests: Array<{
      id: string;
      requestNumber: string;
      customerName: string;
      phone: string;
      email: string | null;
      emailLanguage: string | null;
    }> = [];

    const eligible: typeof candidates = [];
    for (const request of candidates) {
      // Re-check inside the transaction so a concurrent arrival cannot match twice.
      const stillEligible = await tx.customerRequest.findFirst({
        where: { id: request.id, status: 'WAITING', matches: { none: {} } },
        select: { id: true },
      });
      if (stillEligible) eligible.push(request);
    }

    if (eligible.length > 0) {
      // skipDuplicates is an ON CONFLICT DO NOTHING. Catching P2002 inside an
      // interactive PostgreSQL transaction would abort the whole transaction.
      await tx.arrivalMatch.createMany({
        data: eligible.map((request) => ({ arrivalItemId: item.id, requestId: request.id })),
        skipDuplicates: true,
      });
      const inserted = await tx.arrivalMatch.findMany({
        where: { arrivalItemId: item.id, requestId: { in: eligible.map((request) => request.id) } },
        select: { requestId: true },
      });
      const insertedIds = new Set(inserted.map((match) => match.requestId));
      for (const request of eligible) {
        if (!insertedIds.has(request.id)) continue;
        await tx.customerRequest.update({
          where: { id: request.id },
          data: {
            status: 'AVAILABLE',
            availableAt: new Date(),
            productId,
            variantId: variant.id,
          },
        });
        matchedRequests.push({
          id: request.id,
          requestNumber: request.requestNumber,
          customerName: request.customer.name,
          phone: request.customer.phone,
          email: request.email,
          emailLanguage: request.emailLanguage,
        });
      }
    }

    if (matchedRequests.length > 0) {
      await tx.notification.create({
        data: {
          storeId: user.storeId,
          type: 'STOCK_MATCH',
          title: 'notification.stockMatch.title',
          body: JSON.stringify({
            productName: input.productName,
            size: input.size,
            color: input.color,
            count: matchedRequests.length,
          }),
          entityType: 'PRODUCT_VARIANT',
          entityId: variant.id,
        },
      });
    }

    // Outbox rows are written inside the same transaction as the match. Email
    // delivery happens only after this transaction commits (see arrivals route).
    const emailNotificationIds = await queueArrivalEmailNotifications(
      tx,
      {
        storeId: user.storeId,
        arrivalId: arrival.id,
        arrivalItemId: item.id,
        productName: input.productName,
        sku: input.sku,
        size: input.size,
        color: input.color,
        quantity: input.quantity,
      },
      matchedRequests,
    );

    await writeAudit(
      tx,
      user,
      'STOCK_ARRIVAL_CREATED',
      'STOCK_ARRIVAL',
      arrival.id,
      {
        sku: input.sku,
        quantity: input.quantity,
        matched: matchedRequests.length,
      },
    );

    const fullArrival = await tx.stockArrival.findUniqueOrThrow({
      where: { id: arrival.id },
      include: {
        items: { include: { variant: { include: { product: true } }, matches: true } },
        employee: { select: { id: true, name: true } },
      },
    });

    return {
      arrival: fullArrival,
      variantId: variant.id,
      productId,
      quantityBefore: inventoryBefore?.quantity ?? 0,
      quantityAfter: inventory.quantity,
      matchedRequests,
      emailNotificationIds,
    };
  });
}
