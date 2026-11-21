import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { requestSchema, requestStatusSchema } from '../lib/validation.js';
import { normalize, normalizePhone } from '../lib/normalize.js';
import { generateNumber, writeAudit } from '../lib/audit.js';
import { REQUEST_STATUSES, type RequestStatus } from '../lib/constants.js';
import { requireProAccess } from '../lib/subscription.js';

const router = new Router();
router.use(requireAuth);
router.use(asyncRoute(requireProAccess));

const ALLOWED: Record<RequestStatus, RequestStatus[]> = {
  WAITING: ['AVAILABLE', 'CANCELLED'],
  AVAILABLE: ['CONTACTED', 'RESERVED', 'PURCHASED', 'CANCELLED'],
  CONTACTED: ['RESERVED', 'PURCHASED', 'CANCELLED'],
  RESERVED: ['PURCHASED', 'CANCELLED'],
  PURCHASED: [],
  CANCELLED: [],
};

const include = {
  customer: true,
  employee: { select: { id: true, name: true } },
  contactEmployee: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, sku: true } },
  variant: { select: { id: true, sku: true, size: true, color: true, price: true } },
  matches: { include: { arrivalItem: { include: { arrival: true } } } },
};

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const storeId = req.authUser!.storeId;
    const { search, status, from, to, sort } = req.query as Record<string, string | undefined>;
    let requests = await prisma.customerRequest.findMany({
      where: {
        storeId,
        ...(status && status !== 'ALL' && REQUEST_STATUSES.includes(status as RequestStatus)
          ? { status }
          : {}),
        ...(from || to
          ? {
              requestDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      include,
    });

    const q = search?.trim().toLowerCase();
    if (q) {
      requests = requests.filter((r) =>
        [r.requestNumber, r.productName, r.sku, r.size, r.color, r.customer.name, r.customer.phone]
          .some((field) => field.toLowerCase().includes(q)),
      );
    }

    requests.sort((a, b) => {
      if (sort === 'oldest') return a.requestDate.getTime() - b.requestDate.getTime();
      if (sort === 'product') return a.productName.localeCompare(b.productName);
      return b.requestDate.getTime() - a.requestDate.getTime();
    });

    res.json({ requests });
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const request = await prisma.customerRequest.findFirst({
      where: { id: req.params.id, storeId: req.authUser!.storeId },
      include,
    });
    if (!request) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    res.json({ request });
  }),
);

async function findOrCreateCustomer(storeId: string, name: string, phone: string) {
  const normalized = normalizePhone(phone);
  const customers = await prisma.customer.findMany({ where: { storeId } });
  const existing = customers.find((c) => normalizePhone(c.phone) === normalized);
  if (existing) return existing;
  return prisma.customer.create({ data: { storeId, name, phone } });
}

async function resolveVariant(storeId: string, sku: string, size: string, color: string, productName: string) {
  const variants = await prisma.productVariant.findMany({
    where: { storeId },
    include: { product: true },
  });
  let variant = variants.find(
    (v) =>
      (normalize(v.sku) === normalize(sku) || normalize(v.product.sku) === normalize(sku)) &&
      normalize(v.size) === normalize(size) &&
      normalize(v.color) === normalize(color),
  );
  if (!variant) {
    let product = await prisma.product.findFirst({ where: { storeId, sku } });
    if (!product) {
      product = await prisma.product.create({
        data: { storeId, name: productName, sku, category: 'Uncategorized' },
      });
    }
    let variantSku = sku;
    if (variants.some((v) => normalize(v.sku) === normalize(sku))) {
      variantSku = `${sku}-${size}-${color}`.replace(/\s+/g, '-').toUpperCase();
      let suffix = 2;
      while (variants.some((v) => normalize(v.sku) === normalize(variantSku))) {
        variantSku = `${sku}-${size}-${color}-${suffix}`.replace(/\s+/g, '-').toUpperCase();
        suffix += 1;
      }
    }
    const created = await prisma.productVariant.create({
      data: { storeId, productId: product.id, sku: variantSku, size, color, price: 0 },
    });
    await prisma.inventory.create({ data: { storeId, variantId: created.id, quantity: 0 } });
    variant = { ...created, product };
  }
  return variant;
}

router.post(
  '/',
  requirePermission('requests:write'),
  asyncRoute(async (req, res) => {
    const data = requestSchema.parse(req.body);
    const user = req.authUser!;
    const customer = await findOrCreateCustomer(user.storeId, data.customerName, data.phone);
    const variant = await resolveVariant(
      user.storeId,
      data.sku,
      data.size,
      data.color,
      data.productName,
    );
    const request = await prisma.customerRequest.create({
      data: {
        storeId: user.storeId,
        requestNumber: generateNumber('REQ'),
        customerId: customer.id,
        productId: variant.productId,
        variantId: variant.id,
        productName: data.productName,
        sku: data.sku,
        category: data.category || variant.product.category,
        size: data.size,
        color: data.color,
        source: data.source,
        notes: data.notes || null,
        status: 'WAITING',
        requestDate: data.requestDate ?? new Date(),
        employeeId: data.employeeId || user.id,
      },
      include,
    });
    await writeAudit(prisma, user, 'REQUEST_CREATED', 'CUSTOMER_REQUEST', request.id, {
      requestNumber: request.requestNumber,
    });
    res.status(201).json({ request });
  }),
);

router.patch(
  '/:id',
  requirePermission('requests:write'),
  asyncRoute(async (req, res) => {
    const data = requestSchema.parse(req.body);
    const user = req.authUser!;
    const existing = await prisma.customerRequest.findFirst({
      where: { id: req.params.id, storeId: user.storeId },
    });
    if (!existing) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    const customer = await findOrCreateCustomer(user.storeId, data.customerName, data.phone);
    const variant = await resolveVariant(
      user.storeId,
      data.sku,
      data.size,
      data.color,
      data.productName,
    );
    const request = await prisma.customerRequest.update({
      where: { id: existing.id },
      data: {
        customerId: customer.id,
        productId: variant.productId,
        variantId: variant.id,
        productName: data.productName,
        sku: data.sku,
        category: data.category || variant.product.category,
        size: data.size,
        color: data.color,
        source: data.source,
        notes: data.notes || null,
        requestDate: data.requestDate ?? existing.requestDate,
      },
      include,
    });
    await writeAudit(prisma, user, 'REQUEST_UPDATED', 'CUSTOMER_REQUEST', request.id);
    res.json({ request });
  }),
);

router.patch(
  '/:id/status',
  requirePermission('requests:write'),
  asyncRoute(async (req, res) => {
    const { status } = requestStatusSchema.parse(req.body);
    const user = req.authUser!;
    const existing = await prisma.customerRequest.findFirst({
      where: { id: req.params.id, storeId: user.storeId },
      include: { variant: true, customer: true },
    });
    if (!existing) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    if (!ALLOWED[existing.status as RequestStatus]?.includes(status)) {
      res.status(409).json({ message: 'requests.errors.invalidTransition', allowed: ALLOWED[existing.status as RequestStatus] });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (status === 'PURCHASED') {
        if (!existing.variantId) throw new Error('REQUEST_WITHOUT_VARIANT');
        const inventory = await tx.inventory.findUnique({ where: { variantId: existing.variantId } });
        if (!inventory || inventory.quantity <= 0) {
          throw new Error('OUT_OF_STOCK');
        }
        await tx.inventory.update({
          where: { variantId: existing.variantId },
          data: { quantity: { decrement: 1 } },
        });
        await tx.sale.create({
          data: {
            storeId: user.storeId,
            variantId: existing.variantId,
            customerId: existing.customerId,
            requestId: existing.id,
            employeeId: user.id,
            quantity: 1,
            amount: existing.variant?.price ?? 0,
            soldAt: new Date(),
          },
        });
      }
      return tx.customerRequest.update({
        where: { id: existing.id },
        data: {
          status,
          completedAt: status === 'PURCHASED' ? new Date() : existing.completedAt,
          contactedAt: status === 'CONTACTED' ? new Date() : existing.contactedAt,
          contactEmployeeId: status === 'CONTACTED' ? user.id : existing.contactEmployeeId,
        },
        include,
      });
    });

    await writeAudit(prisma, user, 'REQUEST_STATUS_CHANGED', 'CUSTOMER_REQUEST', existing.id, {
      from: existing.status,
      to: status,
    });
    res.json({ request: updated });
  }),
);

router.post(
  '/:id/contact',
  requirePermission('requests:write'),
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const existing = await prisma.customerRequest.findFirst({
      where: { id: req.params.id, storeId: user.storeId },
    });
    if (!existing) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    const request = await prisma.customerRequest.update({
      where: { id: existing.id },
      data: {
        status: 'CONTACTED',
        contactedAt: new Date(),
        contactEmployeeId: user.id,
      },
      include,
    });
    await writeAudit(prisma, user, 'CUSTOMER_CONTACTED', 'CUSTOMER_REQUEST', request.id);
    res.json({ request });
  }),
);

router.delete(
  '/:id',
  requirePermission('requests:delete'),
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const result = await prisma.customerRequest.deleteMany({
      where: { id: req.params.id, storeId: user.storeId },
    });
    if (result.count === 0) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    await writeAudit(prisma, user, 'REQUEST_DELETED', 'CUSTOMER_REQUEST', req.params.id);
    res.json({ ok: true });
  }),
);

export default router;
