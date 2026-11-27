import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { arrivalSchema } from '../lib/validation.js';
import { registerArrival } from '../services/matching.js';
import { dispatchArrivalEmails } from '../services/arrivalEmail.js';
import { requireProAccess } from '../lib/subscription.js';
import { resolveStoreEmployeeId } from '../lib/tenant.js';

const router = new Router();
router.use(requireAuth);
router.use(asyncRoute(requireProAccess));

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const arrivals = await prisma.stockArrival.findMany({
      where: { storeId: req.authUser!.storeId },
      include: {
        employee: { select: { id: true, name: true } },
        items: {
          include: {
            variant: { include: { product: { select: { name: true, category: true } } } },
            matches: {
              include: {
                request: { include: { customer: { select: { id: true, name: true, phone: true } } } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ arrivals });
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const arrival = await prisma.stockArrival.findFirst({
      where: { id: req.params.id, storeId: req.authUser!.storeId },
      include: {
        employee: { select: { id: true, name: true } },
        items: {
          include: {
            variant: { include: { product: true } },
            matches: {
              include: {
                request: { include: { customer: true } },
              },
            },
          },
        },
      },
    });
    if (!arrival) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    res.json({ arrival });
  }),
);

router.post(
  '/',
  requirePermission('arrivals:write'),
  asyncRoute(async (req, res) => {
    const input = arrivalSchema.parse(req.body);
    const user = req.authUser!;
    const employeeId = await resolveStoreEmployeeId(user.storeId, input.employeeId, user.id);
    if (!employeeId) {
      res.status(400).json({ message: 'errors.validation' });
      return;
    }
    const result = await registerArrival({ ...input, employeeId }, user);
    // Email is post-commit only. The dispatcher persists failures and never
    // throws into the arrival response; stock arrivals are never rolled back.
    await dispatchArrivalEmails(result.emailNotificationIds ?? []);
    res.status(201).json(result);
  }),
);

export default router;
