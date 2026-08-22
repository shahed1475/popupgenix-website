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

describe('requireOrgMember', () => {
  it('rejects a user with no organization membership', async () => {
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('nomembership@b.com', 'h', false) RETURNING id`
    );
    const { requireOrgMember } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: user.rows[0].id, email: 'nomembership@b.com', isAdmin: false, sid: 'session-1' };
    const next = vi.fn();
    await requireOrgMember(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(req.membership).toBeUndefined();
  });

  it('attaches the membership for a user who belongs to one organization', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme', 'acme') RETURNING id`);
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('member@acme.test', 'h', false) RETURNING id`
    );
    await pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')`, [
      user.rows[0].id,
      org.rows[0].id,
    ]);
    const { requireOrgMember } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: user.rows[0].id, email: 'member@acme.test', isAdmin: false, sid: 'session-1' };
    const next = vi.fn();
    await requireOrgMember(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.membership).toEqual({ organizationId: org.rows[0].id, role: 'member' });
  });

  it('deterministically picks the same organization when two memberships share created_at (inserted in one transaction)', async () => {
    const orgA = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Org A', 'org-a') RETURNING id`);
    const orgB = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Org B', 'org-b') RETURNING id`);
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('tiebreak@b.com', 'h', false) RETURNING id`
    );

    // Insert both memberships on the same connection inside a single transaction so
    // Postgres's now() (stable per-transaction) gives them an identical created_at,
    // reproducing the tie that `id ASC` must break deterministically.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')`, [
        user.rows[0].id,
        orgA.rows[0].id,
      ]);
      await client.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')`, [
        user.rows[0].id,
        orgB.rows[0].id,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const createdAtRows = await pool.query(`SELECT DISTINCT created_at FROM memberships WHERE user_id = $1`, [
      user.rows[0].id,
    ]);
    expect(createdAtRows.rows).toHaveLength(1); // confirms the tie was actually reproduced

    const { requireOrgMember } = createAuthMiddleware(SECRET, pool);
    const results: Array<string | undefined> = [];
    for (let i = 0; i < 5; i++) {
      const req = mockReq();
      req.user = { sub: user.rows[0].id, email: 'tiebreak@b.com', isAdmin: false, sid: 'session-1' };
      const next = vi.fn();
      await requireOrgMember(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
      results.push(req.membership?.organizationId);
    }

    expect(results).toHaveLength(5);
    expect(new Set(results).size).toBe(1); // same org every time, regardless of which one it is
  });
});

describe('requirePermission', () => {
  it('rejects when there is no membership on the request', () => {
    const { requirePermission } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    const next = vi.fn();
    requirePermission('companies.read')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects a member attempting a write permission', () => {
    const { requirePermission } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.membership = { organizationId: 'org-1', role: 'member' };
    const next = vi.fn();
    requirePermission('companies.write')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('allows an owner a write permission', () => {
    const { requirePermission } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.membership = { organizationId: 'org-1', role: 'owner' };
    const next = vi.fn();
    requirePermission('companies.write')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
