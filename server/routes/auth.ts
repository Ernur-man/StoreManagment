import { Router } from '../lib/router.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { prisma } from '../lib/prisma.js';
import {
  clearSessionCookie,
  issueToken,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../lib/auth.js';
import { asyncRoute } from '../lib/http.js';
import { loginSchema } from '../lib/validation.js';

const router = new Router();

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  message: { error: 'TOO_MANY_REQUESTS', message: 'auth.errors.tooManyRequests' },
});

router.post(
  '/login',
  loginLimiter,
  asyncRoute(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'auth.errors.invalidCredentials' });
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const sessionUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        store: { select: { id: true, name: true, code: true, currency: true } },
      },
    });
    const token = issueToken({
      id: user.id,
      storeId: user.storeId,
      name: user.name,
      email: user.email,
      role: user.role as 'ADMIN' | 'MANAGER' | 'EMPLOYEE',
    });
    setSessionCookie(res, token);
    res.json({ user: sessionUser });
  }),
);

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.authUser!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        store: { select: { id: true, name: true, code: true, currency: true } },
      },
    });
    res.json({ user });
  }),
);

export default router;
