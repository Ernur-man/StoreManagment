import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { requireProAccess } from '../lib/subscription.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { listArrivalEmailNotifications, retryArrivalEmailNotification } from '../services/arrivalEmail.js';

const router = new Router();
router.use(requireAuth);
router.use(asyncRoute(requireProAccess));

const emailRetryLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'RATE_LIMITED', message: 'notifications.errors.rateLimited' },
});

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

// Outbox history and controlled retry. There is deliberately no arbitrary
// "send email" endpoint: only existing, non-sent outbox rows can be retried.
router.get(
  '/emails',
  requirePermission('notifications:read'),
  asyncRoute(async (req, res) => {
    const notifications = await listArrivalEmailNotifications(req.authUser!.storeId);
    res.json({ notifications });
  }),
);

router.post(
  '/emails/:id/retry',
  requirePermission('notifications:write'),
  emailRetryLimiter,
  asyncRoute(async (req, res) => {
    const result = await retryArrivalEmailNotification(req.params.id, req.authUser!.storeId);
    if (result.status === 'NOT_FOUND') {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    if (result.status === 'TERMINAL') {
      res.status(409).json({ message: 'notifications.errors.notRetryable' });
      return;
    }
    if (result.status === 'UNAVAILABLE') {
      res.status(503).json({ error: 'EMAIL_NOT_CONFIGURED', message: 'notifications.errors.emailUnavailable' });
      return;
    }
    res.json({ ok: true, notification: result.notification });
  }),
);

export default router;
