import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { createAuthMiddleware } from './middleware.js';
import { signAuthToken } from './tokens.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

async function insertUserAndSession(overrides: { revoked?: boolean; expired?: boolean } = {}) {
  const user = await pool.query(
    `INSERT INTO users (email, password_hash, is_admin) VALUES ('a@b.com', 'h', false) RETURNING id`
  );
  const expiresAt = overrides.expired ? `now() - interval '1 hour'` : `now() + interval '7 days'`;
  const session = await pool.query(
    `INSERT INTO sessions (user_id, expires_at, revoked_at) VALUES ($1, ${expiresAt}, $2) RETURNING id`,
    [user.rows[0].id, overrides.revoked ? new Date() : null]
  );
  return { userId: user.rows[0].id as string, sessionId: session.rows[0].id as string };
}

describe('auth middleware', () => {
  it('requireAuth rejects a missing token', async () => {
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const next = vi.fn();
    await requireAuth(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth attaches user for a token with a valid, active session', async () => {
    const { userId, sessionId } = await insertUserAndSession();
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId });
  });

  it('requireAuth rejects an invalid token', async () => {
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const req = mockReq({ authorization: 'Bearer not-a-real-token' });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth rejects a token whose session has been revoked', async () => {
    const { userId, sessionId } = await insertUserAndSession({ revoked: true });
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth rejects a token whose session has expired', async () => {
    const { userId, sessionId } = await insertUserAndSession({ expired: true });
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth rejects a token whose sid matches no session row at all', async () => {
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken(
      { sub: '00000000-0000-0000-0000-000000000000', email: 'a@b.com', isAdmin: false, sid: '00000000-0000-0000-0000-000000000000' },
      SECRET,
      '1h'
    );
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('optionalAuth continues without a token', async () => {
    const { optionalAuth } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    const next = vi.fn();
    await optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('optionalAuth continues without attaching a user when the session is revoked', async () => {
    const { userId, sessionId } = await insertUserAndSession({ revoked: true });
    const { optionalAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('requireAdmin rejects a non-admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: false, sid: 'session-1' };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('requireAdmin allows an admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: true, sid: 'session-1' };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
