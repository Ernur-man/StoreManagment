import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { customerSchema } from '../lib/validation.js';
import { normalizePhone } from '../lib/normalize.js';
import { writeAudit } from '../lib/audit.js';
import { requireProAccess } from '../lib/subscription.js';

const router = new Router();
router.use(requireAuth);
router.use(asyncRoute(requireProAccess));

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const customers = await prisma.customer.findMany({
      where: { storeId: req.authUser!.storeId },
      include: {
        requests: { orderBy: { requestDate: 'desc' } },
        sales: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      customers: customers.map((c) => ({
        ...c,
        totalRequests: c.requests.length,
        lastRequestDate: c.requests[0]?.requestDate ?? null,
        totalSpent: c.sales.reduce((sum, s) => sum + s.amount, 0),
        purchases: c.sales.length,
        requestedProducts: [...new Set(c.requests.map((r) => r.productName))],
      })),
    });
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.authUser!.storeId },
      include: {
        requests: {
          include: { variant: { include: { product: true } }, employee: { select: { name: true } } },
          orderBy: { requestDate: 'desc' },
        },
        sales: { include: { variant: { include: { product: true } } }, orderBy: { soldAt: 'desc' } },
      },
    });
    if (!customer) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    res.json({ customer });
  }),
);

router.post(
  '/',
  requirePermission('customers:write'),
  asyncRoute(async (req, res) => {
    const data = customerSchema.parse(req.body);
    const user = req.authUser!;
    const existingByPhone = (
      await prisma.customer.findMany({ where: { storeId: user.storeId }, select: { id: true, phone: true } })
    ).find((c) => normalizePhone(c.phone) === normalizePhone(data.phone));
    if (existingByPhone) {
      res.status(409).json({ message: 'customers.errors.duplicatePhone', id: existingByPhone.id });
      return;
    }
    const customer = await prisma.customer.create({
      data: { ...data, storeId: user.storeId, email: data.email || null },
    });
    await writeAudit(prisma, user, 'CUSTOMER_CREATED', 'CUSTOMER', customer.id);
    res.status(201).json({ customer });
  }),
);

router.patch(
  '/:id',
  requirePermission('customers:write'),
  asyncRoute(async (req, res) => {
    const data = customerSchema.parse(req.body);
    const user = req.authUser!;
    const customer = await prisma.customer.updateMany({
      where: { id: req.params.id, storeId: user.storeId },
      data: { ...data, email: data.email || null },
    });
    if (customer.count === 0) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    await writeAudit(prisma, user, 'CUSTOMER_UPDATED', 'CUSTOMER', req.params.id);
    res.json({ ok: true });
  }),
);

export default router;
