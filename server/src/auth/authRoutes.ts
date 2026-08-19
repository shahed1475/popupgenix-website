import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { hashPassword, verifyPassword } from './password.js';
import { signAuthToken } from './tokens.js';
import type { AuthMiddleware } from './middleware.js';
import { generateSecureToken, hashToken } from './secureToken.js';
import type { EmailSender } from '../email/EmailSender.js';

// Precomputed once so a "no such user" login attempt still pays the bcrypt.compare cost —
// otherwise the early-return-on-missing-user path responds measurably faster than a wrong
// password on a real account, leaking whether an email is registered via response timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', 12);

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
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    is_admin: row.is_admin,
    email_verified_at: row.email_verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createUser(
  pool: Pool,
  email: string,
  password: string,
  fullName: string | null | undefined,
  isAdmin: boolean
): Promise<UserRow> {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    throw new HttpError(409, 'An account with this email already exists');
  }
  const passwordHash = await hashPassword(password);
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, full_name, is_admin)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [email, passwordHash, fullName ?? null, isAdmin]
  );
  return result.rows[0];
}

async function createSession(pool: Pool, userId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
    [userId]
  );
  return result.rows[0].id;
}

export function createAuthRoutes(
  pool: Pool,
  auth: AuthMiddleware,
  jwtSecret: string,
  jwtExpiresIn: string,
  emailSender: EmailSender
): Router {
  const router = Router();
  // 10 requests/IP/minute is generous for legitimate use but bounds credential-stuffing and
  // signup-spam bursts against these two endpoints.
  const authRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
  const resetRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

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
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const flag = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_signup_enabled'`
      );
      if (flag.rows[0]?.setting_value !== 'true') {
        throw new HttpError(403, 'Signup is currently disabled');
      }
      const body = signupSchema.parse(req.body);
      const user = await createUser(pool, body.email, body.password, body.full_name, false);
      const sid = await createSession(pool, user.id);
      const token = signAuthToken({ sub: user.id, email: user.email, isAdmin: user.is_admin, sid }, jwtSecret, jwtExpiresIn);
      res.status(201).json({ token, user: toPublicUser(user) });
    })
  );

  router.post(
    '/login',
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const result = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
      const user = result.rows[0];
      // Always run the bcrypt comparison, even for a nonexistent email, against a dummy hash —
      // otherwise this branch returns before doing any hashing work and a timing side-channel
      // reveals whether the email is registered.
      const passwordValid = await verifyPassword(body.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
      if (!user || !passwordValid) {
        throw new HttpError(401, 'Invalid email or password');
      }
      const sid = await createSession(pool, user.id);
      const token = signAuthToken(
        { sub: user.id, email: user.email, isAdmin: user.is_admin, sid },
        jwtSecret,
        jwtExpiresIn
      );
      res.json({ token, user: toPublicUser(user) });
    })
  );

  router.post(
    '/logout',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [req.user!.sid]);
      res.status(204).send();
    })
  );

  router.post(
    '/verify-email/request',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const userResult = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [req.user!.sub]);
      const user = userResult.rows[0];
      if (!user) throw new HttpError(404, 'User not found');
      if (user.email_verified_at) {
        res.status(200).json({ alreadyVerified: true });
        return;
      }
      const rawToken = generateSecureToken();
      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
        [user.id, hashToken(rawToken)]
      );
      await emailSender.send({
        to: user.email,
        subject: 'Verify your email',
        text: `Confirm your email by visiting: /verify-email?token=${rawToken}`,
      });
      res.status(202).json({ sent: true });
    })
  );

  router.post(
    '/verify-email/confirm',
    asyncHandler(async (req, res) => {
      const body = z.object({ token: z.string().min(1) }).parse(req.body);
      const tokenHash = hashToken(body.token);
      const result = await pool.query<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
        'SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      const record = result.rows[0];
      if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
        throw new HttpError(400, 'Invalid or expired verification token');
      }
      await pool.query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [record.id]);
      await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [record.user_id]);
      res.status(200).json({ verified: true });
    })
  );

  router.post(
    '/password-reset/request',
    resetRateLimiter,
    asyncHandler(async (req, res) => {
      const body = z.object({ email: z.string().email() }).parse(req.body);
      const userResult = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
      const user = userResult.rows[0];
      if (user) {
        const rawToken = generateSecureToken();
        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
          [user.id, hashToken(rawToken)]
        );
        await emailSender.send({
          to: user.email,
          subject: 'Reset your password',
          text: `Reset your password by visiting: /reset-password?token=${rawToken}`,
        });
      }
      // Always 202, whether or not the email exists — a differing response would let an attacker
      // enumerate registered accounts.
      res.status(202).json({ sent: true });
    })
  );

  router.post(
    '/password-reset/confirm',
    resetRateLimiter,
    asyncHandler(async (req, res) => {
      const body = z.object({ token: z.string().min(1), password: z.string().min(8) }).parse(req.body);
      const tokenHash = hashToken(body.token);
      const result = await pool.query<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
        'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      const record = result.rows[0];
      if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
        throw new HttpError(400, 'Invalid or expired reset token');
      }
      const newPasswordHash = await hashPassword(body.password);
      await pool.query('BEGIN');
      try {
        await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, record.user_id]);
        await pool.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [record.user_id]);
        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
      res.status(200).json({ reset: true });
    })
  );

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
      const user = await createUser(pool, body.email, body.password, body.full_name, false);
      res.status(201).json(toPublicUser(user));
    })
  );

  return router;
}
