import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import { hashPassword, verifyPassword } from './password.js';
import { signAuthToken } from './tokens.js';
import type { AuthMiddleware } from './middleware.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().nullable().optional(),
});

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    is_admin: row.is_admin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createAuthRoutes(
  pool: Pool,
  auth: AuthMiddleware,
  jwtSecret: string,
  jwtExpiresIn: string
): Router {
  const router = Router();

  router.get(
    '/signup-enabled',
    asyncHandler(async (_req, res) => {
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_signup_enabled'`
      );
      res.json({ enabled: result.rows[0]?.setting_value === 'true' });
    })
  );

  router.post(
    '/signup',
    asyncHandler(async (req, res) => {
      const flag = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_signup_enabled'`
      );
      if (flag.rows[0]?.setting_value !== 'true') {
        throw new HttpError(403, 'Signup is currently disabled');
      }
      const body = signupSchema.parse(req.body);
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [body.email]);
      if (existing.rows[0]) {
        throw new HttpError(409, 'An account with this email already exists');
      }
      const passwordHash = await hashPassword(body.password);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, full_name, is_admin)
         VALUES ($1, $2, $3, false) RETURNING *`,
        [body.email, passwordHash, body.full_name ?? null]
      );
      res.status(201).json(toPublicUser(result.rows[0]));
    })
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const result = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
      const user = result.rows[0];
      if (!user || !(await verifyPassword(body.password, user.password_hash))) {
        throw new HttpError(401, 'Invalid email or password');
      }
      const token = signAuthToken(
        { sub: user.id, email: user.email, isAdmin: user.is_admin },
        jwtSecret,
        jwtExpiresIn
      );
      res.json({ token, user: toPublicUser(user) });
    })
  );

  router.post('/logout', (_req, res) => {
    res.status(204).send();
  });

  router.get(
    '/me',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [req.user!.sub]);
      const user = result.rows[0];
      if (!user) throw new HttpError(404, 'User not found');
      res.json(toPublicUser(user));
    })
  );

  router.get(
    '/users',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query<UserRow>(
        `SELECT * FROM users WHERE is_admin = false ORDER BY created_at DESC`
      );
      res.json(result.rows.map(toPublicUser));
    })
  );

  router.post(
    '/users',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = signupSchema.parse(req.body);
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [body.email]);
      if (existing.rows[0]) {
        throw new HttpError(409, 'An account with this email already exists');
      }
      const passwordHash = await hashPassword(body.password);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, full_name, is_admin)
         VALUES ($1, $2, $3, false) RETURNING *`,
        [body.email, passwordHash, body.full_name ?? null]
      );
      res.status(201).json(toPublicUser(result.rows[0]));
    })
  );

  return router;
}
