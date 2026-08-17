import type { NextFunction, Request, RequestHandler, Response } from 'express';
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
  return { sub: payload.sub, email: payload.email, isAdmin: payload.isAdmin };
}

export function createAuthMiddleware(secret: string): AuthMiddleware {
  function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (token) {
      try {
        req.user = toAuthTokenPayload(verifyAuthToken(token, secret));
      } catch {
        // invalid token on an optional route just means "not authenticated"
      }
    }
    next();
  }

  function requireAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (!token) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    try {
      req.user = toAuthTokenPayload(verifyAuthToken(token, secret));
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
      return;
    }
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
