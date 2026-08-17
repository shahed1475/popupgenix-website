import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createAuthMiddleware } from './middleware.js';
import { signAuthToken } from './tokens.js';

const SECRET = 'test-secret-value-that-is-long-enough';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('auth middleware', () => {
  it('requireAuth rejects a missing token', () => {
    const { requireAuth } = createAuthMiddleware(SECRET);
    const next = vi.fn();
    requireAuth(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth attaches user for a valid token', () => {
    const { requireAuth } = createAuthMiddleware(SECRET);
    const token = signAuthToken({ sub: 'user-1', email: 'a@b.com', isAdmin: false }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ sub: 'user-1', email: 'a@b.com', isAdmin: false });
  });

  it('requireAuth rejects an invalid token', () => {
    const { requireAuth } = createAuthMiddleware(SECRET);
    const req = mockReq({ authorization: 'Bearer not-a-real-token' });
    const next = vi.fn();
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('optionalAuth continues without a token', () => {
    const { optionalAuth } = createAuthMiddleware(SECRET);
    const req = mockReq();
    const next = vi.fn();
    optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('requireAdmin rejects a non-admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: false };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('requireAdmin allows an admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: true };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
