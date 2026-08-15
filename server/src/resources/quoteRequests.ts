import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  project_type: z.string().min(1),
  project_description: z.string().min(1),
  budget_range: z.string().min(1),
  timeline: z.string().nullable().optional(),
  additional_requirements: z.string().nullable().optional(),
});

const updateSchema = z.object({
  status: z.string().optional(),
  estimated_cost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export function createQuoteRequestsRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = createSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO quote_requests
          (name, email, phone, company, project_type, project_description, budget_range,
           timeline, additional_requirements)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          body.name,
          body.email,
          body.phone ?? null,
          body.company ?? null,
          body.project_type,
          body.project_description,
          body.budget_range,
          body.timeline ?? null,
          body.additional_requirements ?? null,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    '/',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM quote_requests ORDER BY created_at DESC');
      res.json(result.rows);
    })
  );

  router.patch(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE quote_requests SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Quote request not found');
      res.json(result.rows[0]);
    })
  );

  return router;
}
