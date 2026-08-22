import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  size_range: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export function createCompaniesRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.requireAuth,
    auth.requireOrgMember,
    auth.requirePermission('companies.read'),
    asyncHandler(async (req, res) => {
      const result = await pool.query('SELECT * FROM companies WHERE organization_id = $1 ORDER BY created_at DESC', [
        req.membership!.organizationId,
      ]);
      res.json(result.rows);
    })
  );

  router.get(
    '/:id',
    auth.requireAuth,
    auth.requireOrgMember,
    auth.requirePermission('companies.read'),
    asyncHandler(async (req, res) => {
      const result = await pool.query('SELECT * FROM companies WHERE id = $1 AND organization_id = $2', [
        req.params.id,
        req.membership!.organizationId,
      ]);
      const company = result.rows[0];
      if (!company) throw new HttpError(404, 'Company not found');
      res.json(company);
    })
  );

  router.post(
    '/',
    auth.requireAuth,
    auth.requireOrgMember,
    auth.requirePermission('companies.write'),
    asyncHandler(async (req, res) => {
      const body = createCompanySchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO companies
          (organization_id, name, domain, industry, size_range, country, website, linkedin_url, description, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          req.membership!.organizationId,
          body.name,
          body.domain ?? null,
          body.industry ?? null,
          body.size_range ?? null,
          body.country ?? null,
          body.website ?? null,
          body.linkedin_url ?? null,
          body.description ?? null,
          body.metadata,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  return router;
}
