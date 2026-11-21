import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { issueToken } from './auth';
import type { AuthUser } from './auth';

const user: AuthUser = {
  id: 'user_1',
  storeId: 'store_1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'ADMIN',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('JWT secret configuration', () => {
  it('refuses to issue tokens in production without JWT_SECRET', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    expect(() => issueToken(user)).toThrow(/JWT_SECRET/);
  });

  it('signs and verifies tokens with the configured production secret', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'production-test-secret');
    const token = issueToken(user);
    expect(jwt.verify(token, 'production-test-secret')).toMatchObject({
      sub: user.id,
      storeId: user.storeId,
      role: user.role,
    });
  });

  it('allows the development fallback outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', '');
    expect(issueToken(user)).toEqual(expect.any(String));
  });
});
