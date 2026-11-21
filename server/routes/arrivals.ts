import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { arrivalSchema } from '../lib/validation.js';
import { registerArrival } from '../services/matching.js';
import { requireProAccess } from '../lib/subscription.js';

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
  asyncRoute(async (req, res) => {
    const input = arrivalSchema.parse(req.body);
    const result = await registerArrival(input, req.authUser!);
    res.status(201).json(result);
  }),
);

export default router;
