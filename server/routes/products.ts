import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { adjustInventorySchema, productSchema } from '../lib/validation.js';
import { availabilityFor } from '../lib/constants.js';
import { writeAudit } from '../lib/audit.js';
import { requireProAccess } from '../lib/subscription.js';

const router = new Router();
router.use(requireAuth);
router.use(asyncRoute(requireProAccess));

function withAvailability(variant: {
  id: string;
  lowStockThreshold: number;
  inventory: { quantity: number } | null;
}) {
  const quantity = variant.inventory?.quantity ?? 0;
  return {
    ...variant,
    quantity,
    availability: availabilityFor(quantity, variant.lowStockThreshold),
  };
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const storeId = req.authUser!.storeId;
    const products = await prisma.product.findMany({
      where: { storeId },
      include: {
        variants: {
          include: { inventory: true, _count: { select: { requests: true, sales: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products: products.map((p) => ({ ...p, variants: p.variants.map(withAvailability) })) });
  }),
);

router.get(
  '/meta',
  asyncRoute(async (req, res) => {
    const storeId = req.authUser!.storeId;
    const products = await prisma.product.findMany({
      where: { storeId },
      select: { category: true, brand: true },
    });
    const variants = await prisma.productVariant.findMany({
      where: { storeId },
      select: { size: true, color: true },
    });
    const unique = (values: Array<string | null>) =>
      [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
    res.json({
      categories: unique(products.map((p) => p.category)),
      brands: unique(products.map((p) => p.brand)),
      sizes: unique(variants.map((v) => v.size)),
      colors: unique(variants.map((v) => v.color)),
    });
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.authUser!.storeId },
      include: {
        variants: {
          include: {
            inventory: true,
            requests: { include: { customer: true }, orderBy: { createdAt: 'desc' }, take: 10 },
            sales: true,
          },
        },
      },
    });
    if (!product) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    res.json({ product: { ...product, variants: product.variants.map(withAvailability) } });
  }),
);

router.post(
  '/',
  requirePermission('products:write'),
  asyncRoute(async (req, res) => {
    const data = productSchema.parse(req.body);
    const user = req.authUser!;
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          storeId: user.storeId,
          name: data.name,
          sku: data.sku,
          category: data.category,
          brand: data.brand || null,
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          isActive: data.isActive,
        },
      });
      for (const variant of data.variants) {
        const v = await tx.productVariant.create({
          data: {
            storeId: user.storeId,
            productId: created.id,
            sku: variant.sku,
            size: variant.size,
            color: variant.color,
            price: variant.price,
            imageUrl: variant.imageUrl || created.imageUrl || null,
            lowStockThreshold: variant.lowStockThreshold ?? 3,
          },
        });
        await tx.inventory.create({
          data: { storeId: user.storeId, variantId: v.id, quantity: variant.quantity ?? 0 },
        });
      }
      return created;
    });
    await writeAudit(prisma, user, 'PRODUCT_CREATED', 'PRODUCT', product.id, { sku: data.sku });
    res.status(201).json({ id: product.id });
  }),
);

router.patch(
  '/:id',
  requirePermission('products:write'),
  asyncRoute(async (req, res) => {
    const data = productSchema.parse(req.body);
    const id = req.params.id;
    const user = req.authUser!;
    const existing = await prisma.product.findFirst({
      where: { id, storeId: user.storeId },
      include: { variants: true },
    });
    if (!existing) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          sku: data.sku,
          category: data.category,
          brand: data.brand || null,
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          isActive: data.isActive,
        },
      });
      for (const variant of data.variants) {
        const belongs = existing.variants.find((v) => v.id === variant.id);
        if (belongs) {
          await tx.productVariant.update({
            where: { id: belongs.id },
            data: {
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
              price: variant.price,
              imageUrl: variant.imageUrl || null,
              lowStockThreshold: variant.lowStockThreshold ?? 3,
            },
          });
          if (variant.quantity !== undefined) {
            await tx.inventory.upsert({
              where: { variantId: belongs.id },
              create: { storeId: user.storeId, variantId: belongs.id, quantity: variant.quantity },
              update: { quantity: variant.quantity },
            });
          }
        } else {
          const v = await tx.productVariant.create({
            data: {
              storeId: user.storeId,
              productId: id,
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
              price: variant.price,
              imageUrl: variant.imageUrl || null,
              lowStockThreshold: variant.lowStockThreshold ?? 3,
            },
          });
          await tx.inventory.create({
            data: { storeId: user.storeId, variantId: v.id, quantity: variant.quantity ?? 0 },
          });
        }
      }
    });
    await writeAudit(prisma, user, 'PRODUCT_UPDATED', 'PRODUCT', id);
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  requirePermission('products:delete'),
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const result = await prisma.product.deleteMany({
      where: { id: req.params.id, storeId: user.storeId },
    });
    if (result.count === 0) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    await writeAudit(prisma, user, 'PRODUCT_DELETED', 'PRODUCT', req.params.id);
    res.json({ ok: true });
  }),
);

router.patch(
  '/variants/:id/inventory',
  requirePermission('products:write'),
  asyncRoute(async (req, res) => {
    const { quantity } = adjustInventorySchema.parse(req.body);
    const user = req.authUser!;
    const variant = await prisma.productVariant.findFirst({
      where: { id: req.params.id, storeId: user.storeId },
    });
    if (!variant) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    const inventory = await prisma.inventory.upsert({
      where: { variantId: variant.id },
      create: { storeId: user.storeId, variantId: variant.id, quantity },
      update: { quantity },
    });
    await writeAudit(prisma, user, 'INVENTORY_ADJUSTED', 'PRODUCT_VARIANT', variant.id, { quantity });
    res.json({ inventory });
  }),
);

router.delete(
  '/variants/:id',
  requirePermission('products:delete'),
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const variant = await prisma.productVariant.findFirst({
      where: { id: req.params.id, storeId: user.storeId },
      include: { _count: { select: { sales: true, arrivalItems: true } } },
    });
    if (!variant) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    if (variant._count.sales > 0 || variant._count.arrivalItems > 0) {
      res.status(409).json({ message: 'errors.variantInUse' });
      return;
    }
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await writeAudit(prisma, user, 'VARIANT_DELETED', 'PRODUCT_VARIANT', variant.id);
    res.json({ ok: true });
  }),
);

export default router;
