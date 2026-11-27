import { Router } from '../lib/router.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { settingsSchema, userPatchSchema, userSchema } from '../lib/validation.js';
import { writeAudit } from '../lib/audit.js';

const router = new Router();
router.use(requireAuth);

router.get(
  '/store',
  asyncRoute(async (req, res) => {
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: req.authUser!.storeId },
      select: {
        id: true,
        name: true,
        code: true,
        currency: true,
        address: true,
        phone: true,
        email: true,
        lowStockThreshold: true,
        createdAt: true,
      },
    });
    res.json({ store });
  }),
);

router.patch(
  '/store',
  requirePermission('settings:write'),
  asyncRoute(async (req, res) => {
    const data = settingsSchema.parse(req.body);
    const user = req.authUser!;
    const store = await prisma.store.update({
      where: { id: user.storeId },
      data,
    });
    await writeAudit(prisma, user, 'STORE_SETTINGS_UPDATED', 'STORE', store.id, data);
    res.json({ store });
  }),
);

router.get(
  '/users',
  requirePermission('settings:read'),
  asyncRoute(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { storeId: req.authUser!.storeId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ users });
  }),
);

router.post(
  '/users',
  requirePermission('settings:write'),
  asyncRoute(async (req, res) => {
    const data = userSchema.parse(req.body);
    if (!data.password) {
      res.status(400).json({ message: 'settings.errors.passwordRequired' });
      return;
    }
    const user = req.authUser!;
    if (data.role === 'ADMIN' && user.role !== 'ADMIN') {
      res.status(403).json({ message: 'settings.errors.adminOnly' });
      return;
    }
    const created = await prisma.user.create({
      data: {
        storeId: user.storeId,
        name: data.name,
        email: data.email,
        role: data.role ?? 'EMPLOYEE',
        active: data.active ?? true,
        passwordHash: await bcrypt.hash(data.password, 12),
      },
    });
    await writeAudit(prisma, user, 'USER_CREATED', 'USER', created.id, { email: created.email });
    res.status(201).json({ id: created.id });
  }),
);

router.patch(
  '/users/:id',
  requirePermission('settings:write'),
  asyncRoute(async (req, res) => {
    const data = userPatchSchema.parse(req.body);
    const user = req.authUser!;
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, storeId: user.storeId },
    });
    if (!target) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    if (user.role !== 'ADMIN' && (target.role === 'ADMIN' || data.role === 'ADMIN')) {
      res.status(403).json({ message: 'settings.errors.adminOnly' });
      return;
    }
    if (user.role !== 'ADMIN' && data.password && target.id !== user.id) {
      res.status(403).json({ message: 'settings.errors.adminOnly' });
      return;
    }
    if (target.role === 'ADMIN' && (data.role && data.role !== 'ADMIN' || data.active === false)) {
      const admins = await prisma.user.count({ where: { storeId: user.storeId, role: 'ADMIN', active: true } });
      if (admins <= 1) {
        res.status(409).json({ message: 'settings.errors.lastAdmin' });
        return;
      }
    }
    await prisma.user.update({
      where: { id: target.id },
      data: {
        name: data.name ?? target.name,
        email: data.email ?? target.email,
        role: data.role ?? target.role,
        active: data.active ?? target.active,
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 12) } : {}),
      },
    });
    await writeAudit(prisma, user, 'USER_UPDATED', 'USER', target.id);
    res.json({ ok: true });
  }),
);

router.delete(
  '/users/:id',
  requirePermission('settings:write'),
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    if (req.params.id === user.id) {
      res.status(409).json({ message: 'settings.errors.cannotDeleteSelf' });
      return;
    }
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, storeId: user.storeId },
    });
    if (!target) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    if (target.role === 'ADMIN' && user.role !== 'ADMIN') {
      res.status(403).json({ message: 'settings.errors.adminOnly' });
      return;
    }
    await prisma.user.delete({ where: { id: target.id } });
    await writeAudit(prisma, user, 'USER_DELETED', 'USER', target.id);
    res.json({ ok: true });
  }),
);

router.get(
  '/audit',
  requirePermission('audit:read'),
  asyncRoute(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      where: { storeId: req.authUser!.storeId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ logs });
  }),
);

export default router;
