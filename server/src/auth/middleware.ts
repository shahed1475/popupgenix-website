import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import { HttpError } from '../lib/httpError.js';
import { verifyAuthToken, type AuthTokenPayload } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export interface AuthMiddleware {
  optionalAuth: RequestHandler;
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

function toAuthTokenPayload(payload: AuthTokenPayload): AuthTokenPayload {
  return { sub: payload.sub, email: payload.email, isAdmin: payload.isAdmin, sid: payload.sid };
}

async function loadActiveSession(pool: Pool, sid: string): Promise<boolean> {
  const result = await pool.query<{ revoked_at: string | null; expires_at: string }>(
    'SELECT revoked_at, expires_at FROM sessions WHERE id = $1',
    [sid]
  );
  const session = result.rows[0];
  if (!session) return false;
  if (session.revoked_at) return false;
  if (new Date(session.expires_at) < new Date()) return false;
  return true;
}

export function createAuthMiddleware(secret: string, pool: Pool): AuthMiddleware {
  async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = extractToken(req);
    if (token) {
      try {
        const payload = verifyAuthToken(token, secret);
        if (await loadActiveSession(pool, payload.sid)) {
          req.user = toAuthTokenPayload(payload);
        }
      } catch {
        // invalid token or DB error on an optional route just means "not authenticated"
      }
    }
    next();
  }

  async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = extractToken(req);
    if (!token) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    let payload: AuthTokenPayload;
    try {
      payload = verifyAuthToken(token, secret);
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
      return;
    }
    try {
      if (!(await loadActiveSession(pool, payload.sid))) {
        next(new HttpError(401, 'Session has been revoked or expired'));
        return;
      }
    } catch (err) {
      next(err);
      return;
    }
    req.user = toAuthTokenPayload(payload);
    next();
  }

  function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    if (!req.user.isAdmin) {
      next(new HttpError(403, 'Admin access required'));
      return;
    }
    next();
  }

  return { optionalAuth, requireAuth, requireAdmin };
}
