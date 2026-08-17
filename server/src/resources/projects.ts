import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  status: z.string().default('active'),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  completion_percentage: z.number().int().min(0).max(100).default(0),
  technologies: z.array(z.string()).default([]),
  image_url: z.string().nullable().optional(),
  project_url: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  client_user_id: z.string().uuid().nullable().optional(),
  next_milestone: z.string().nullable().optional(),
  eta_date: z.string().nullable().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

export function createProjectsRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = req.user!.isAdmin
        ? await pool.query('SELECT * FROM projects ORDER BY created_at DESC')
        : await pool.query('SELECT * FROM projects WHERE client_user_id = $1 ORDER BY created_at DESC', [
            req.user!.sub,
          ]);
      res.json(result.rows);
    })
  );

  router.get(
    '/:id',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
      const project = result.rows[0];
      if (!project) throw new HttpError(404, 'Project not found');
      if (!req.user!.isAdmin && project.client_user_id !== req.user!.sub) {
        throw new HttpError(404, 'Project not found');
      }
      res.json(project);
    })
  );

  router.post(
    '/',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = createProjectSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO projects
          (title, description, category, status, active, featured, completion_percentage,
           technologies, image_url, project_url, client_name, client_user_id, next_milestone, eta_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          body.title,
          body.description,
          body.category,
          body.status,
          body.active,
          body.featured,
          body.completion_percentage,
          body.technologies,
          body.image_url ?? null,
          body.project_url ?? null,
          body.client_name ?? null,
          body.client_user_id ?? null,
          body.next_milestone ?? null,
          body.eta_date ?? null,
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
      const body = updateProjectSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE projects SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Project not found');
      res.json(result.rows[0]);
    })
  );

  router.delete(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rows[0]) throw new HttpError(404, 'Project not found');
      res.status(204).send();
    })
  );

  return router;
}
