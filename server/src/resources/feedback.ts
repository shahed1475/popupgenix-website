import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createFeedbackSchema = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_company: z.string().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  rating: z.number().int().min(1).max(5),
  testimonial: z.string().min(1),
});

const updateFeedbackSchema = z.object({
  status: z.string().optional(),
  featured: z.boolean().optional(),
});

export function createFeedbackRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const result = await pool.query(
        `SELECT id, testimonial, rating, created_at, client_name, client_company, featured
         FROM feedback
         WHERE status = 'approved' AND deleted_at IS NULL
         ORDER BY featured DESC, created_at DESC`
      );
      res.json(result.rows);
    })
  );

  router.get(
    '/mine',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = await pool.query(
        'SELECT * FROM feedback WHERE client_email = $1 ORDER BY created_at DESC',
        [req.user!.email]
      );
      res.json(result.rows);
    })
  );

  router.get(
    '/admin',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM feedback ORDER BY created_at DESC');
      res.json(result.rows);
    })
  );

  router.post(
    '/',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const body = createFeedbackSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO feedback (client_name, client_email, client_company, project_id, rating, testimonial)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          body.client_name,
          body.client_email,
          body.client_company ?? null,
          body.project_id ?? null,
          body.rating,
          body.testimonial,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.patch(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateFeedbackSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE feedback SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Feedback not found');
      res.json(result.rows[0]);
    })
  );

  router.delete(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('UPDATE feedback SET deleted_at = now() WHERE id = $1 RETURNING id', [
        req.params.id,
      ]);
      if (!result.rows[0]) throw new HttpError(404, 'Feedback not found');
      res.status(204).send();
    })
  );

  return router;
}
