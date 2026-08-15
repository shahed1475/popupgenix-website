import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const HOMEPAGE_CONTENT_ID = '00000000-0000-0000-0000-000000000001';

const contentSchema = z.object({
  hero_title: z.string().default(''),
  hero_subtitle: z.string().default(''),
  hero_cta_primary: z.string().default(''),
  hero_cta_secondary: z.string().default(''),
  about_title: z.string().default(''),
  about_description: z.string().default(''),
  clients_count: z.number().int().default(0),
  projects_count: z.number().int().default(0),
  satisfaction_rate: z.number().int().default(0),
  team_size: z.number().int().default(0),
});

export function createHomepageContentRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM homepage_content WHERE id = $1', [
        HOMEPAGE_CONTENT_ID,
      ]);
      res.json(result.rows[0] ?? null);
    })
  );

  router.put(
    '/',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = contentSchema.parse(req.body);

      const result = await pool.query(
        `INSERT INTO homepage_content
          (id, hero_title, hero_subtitle, hero_cta_primary, hero_cta_secondary, about_title,
           about_description, clients_count, projects_count, satisfaction_rate, team_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           hero_title = EXCLUDED.hero_title,
           hero_subtitle = EXCLUDED.hero_subtitle,
           hero_cta_primary = EXCLUDED.hero_cta_primary,
           hero_cta_secondary = EXCLUDED.hero_cta_secondary,
           about_title = EXCLUDED.about_title,
           about_description = EXCLUDED.about_description,
           clients_count = EXCLUDED.clients_count,
           projects_count = EXCLUDED.projects_count,
           satisfaction_rate = EXCLUDED.satisfaction_rate,
           team_size = EXCLUDED.team_size,
           updated_at = now()
         RETURNING *`,
        [
          HOMEPAGE_CONTENT_ID,
          body.hero_title,
          body.hero_subtitle,
          body.hero_cta_primary,
          body.hero_cta_secondary,
          body.about_title,
          body.about_description,
          body.clients_count,
          body.projects_count,
          body.satisfaction_rate,
          body.team_size,
        ]
      );

      res.json(result.rows[0]);
    })
  );

  return router;
}
