import type { HttpRequest as Request, HttpResponse as Response, NextFunction } from './router.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';
import { can, type Role } from './constants.js';

const COOKIE_NAME = 'wishstock_session';
const SECRET = process.env.JWT_SECRET || 'wishstock-insecure-development-secret';

export interface AuthUser {
  id: string;
  storeId: string;
  name: string;
  email: string;
  role: Role;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function issueToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, storeId: user.storeId, role: user.role, name: user.name, email: user.email },
    SECRET,
    { expiresIn: '7d' },
  );
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function readToken(req: Request): string | null {
  const cookie = req.cookies?.[COOKIE_NAME];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'auth.errors.unauthenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, storeId: true, name: true, email: true, role: true, active: true },
    });
    if (!user || !user.active || user.storeId !== payload.storeId) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'UNAUTHENTICATED', message: 'auth.errors.unauthenticated' });
      return;
    }
    req.authUser = {
      id: user.id,
      storeId: user.storeId,
      name: user.name,
      email: user.email,
      role: user.role as Role,
    };
    next();
  } catch {
    clearSessionCookie(res);
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'auth.errors.unauthenticated' });
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser || !can(req.authUser.role, permission)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'auth.errors.forbidden' });
      return;
    }
    next();
  };
}
