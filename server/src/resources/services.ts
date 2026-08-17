import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createServiceSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().default('star'),
  features: z.array(z.string()).default([]),
  order_index: z.number().int().default(0),
  active: z.boolean().default(true),
});

const updateServiceSchema = createServiceSchema.partial();

export function createServicesRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.optionalAuth,
    asyncHandler(async (req, res) => {
      const result = req.user?.isAdmin
        ? await pool.query('SELECT * FROM services ORDER BY order_index ASC')
        : await pool.query('SELECT * FROM services WHERE active = true ORDER BY order_index ASC');
      res.json(result.rows);
    })
  );

  router.post(
    '/',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = createServiceSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO services (title, description, icon, features, order_index, active)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [body.title, body.description, body.icon, body.features, body.order_index, body.active]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.patch(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateServiceSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE services SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Service not found');
      res.json(result.rows[0]);
    })
  );

  router.delete(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rows[0]) throw new HttpError(404, 'Service not found');
      res.status(204).send();
    })
  );

  return router;
}
