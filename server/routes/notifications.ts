import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { requireProAccess } from '../lib/subscription.js';

const router = new Router();
router.use(requireAuth);
router.use(asyncRoute(requireProAccess));

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const visibility = {
      storeId: req.authUser!.storeId,
      OR: [{ userId: null }, { userId: req.authUser!.id }],
    };
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: visibility,
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      prisma.notification.count({ where: { ...visibility, read: false } }),
    ]);
    res.json({ notifications, unread });
  }),
);

router.patch(
  '/read-all',
  asyncRoute(async (req, res) => {
    await prisma.notification.updateMany({
      where: {
        storeId: req.authUser!.storeId,
        read: false,
        OR: [{ userId: null }, { userId: req.authUser!.id }],
      },
      data: { read: true },
    });
    res.json({ ok: true });
  }),
);

router.patch(
  '/:id/read',
  asyncRoute(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: {
        id: req.params.id,
        storeId: req.authUser!.storeId,
        OR: [{ userId: null }, { userId: req.authUser!.id }],
      },
      data: { read: true },
    });
    if (result.count === 0) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    res.json({ ok: true });
  }),
);

export default router;
