import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import type { AuthMiddleware } from '../auth/middleware.js';

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
      const result = await pool.query('SELECT * FROM homepage_content ORDER BY created_at ASC LIMIT 1');
      res.json(result.rows[0] ?? null);
    })
  );

  router.put(
    '/',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = contentSchema.parse(req.body);
      const existing = await pool.query('SELECT id FROM homepage_content ORDER BY created_at ASC LIMIT 1');

      if (existing.rows[0]) {
        const result = await pool.query(
          `UPDATE homepage_content SET
             hero_title=$1, hero_subtitle=$2, hero_cta_primary=$3, hero_cta_secondary=$4,
             about_title=$5, about_description=$6, clients_count=$7, projects_count=$8,
             satisfaction_rate=$9, team_size=$10, updated_at = now()
           WHERE id = $11 RETURNING *`,
          [
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
            existing.rows[0].id,
          ]
        );
        res.json(result.rows[0]);
        return;
      }

      const result = await pool.query(
        `INSERT INTO homepage_content
          (hero_title, hero_subtitle, hero_cta_primary, hero_cta_secondary, about_title,
           about_description, clients_count, projects_count, satisfaction_rate, team_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
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
      res.status(201).json(result.rows[0]);
    })
  );

  return router;
}
