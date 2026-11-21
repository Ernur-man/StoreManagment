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
    const notifications = await prisma.notification.findMany({
      where: { storeId: req.authUser!.storeId, OR: [{ userId: null }, { userId: req.authUser!.id }] },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const unread = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unread });
  }),
);

router.patch(
  '/read-all',
  asyncRoute(async (req, res) => {
    await prisma.notification.updateMany({
      where: { storeId: req.authUser!.storeId, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  }),
);

router.patch(
  '/:id/read',
  asyncRoute(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, storeId: req.authUser!.storeId },
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
