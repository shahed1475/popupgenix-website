import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const lineItemSchema = z.object({
  service_name: z.string().min(1),
  description: z.string().nullable().optional(),
  quantity: z.number().default(1),
  rate: z.number().default(0),
  amount: z.number().default(0),
});

const invoiceSchema = z.object({
  invoice_number: z.string().min(1),
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_company: z.string().nullable().optional(),
  client_phone: z.string().nullable().optional(),
  client_address: z.string().nullable().optional(),
  issue_date: z.string().optional(),
  due_date: z.string(),
  subtotal: z.number().default(0),
  discount: z.number().default(0),
  tax: z.number().default(0),
  total: z.number().default(0),
  status: z.string().default('draft'),
  payment_instructions: z.string().nullable().optional(),
  line_items: z.array(lineItemSchema).default([]),
});

async function insertLineItems(
  client: PoolClient,
  invoiceId: string,
  items: z.infer<typeof lineItemSchema>[]
): Promise<Record<string, unknown>[]> {
  const inserted: Record<string, unknown>[] = [];
  for (const item of items) {
    const result = await client.query(
      `INSERT INTO invoice_line_items (invoice_id, service_name, description, quantity, rate, amount)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [invoiceId, item.service_name, item.description ?? null, item.quantity, item.rate, item.amount]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

export function createInvoicesRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
      res.json(result.rows);
    })
  );

  router.get(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const invoice = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
      if (!invoice.rows[0]) throw new HttpError(404, 'Invoice not found');
      const lineItems = await pool.query(
        'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at ASC',
        [req.params.id]
      );
      res.json({ ...invoice.rows[0], line_items: lineItems.rows });
    })
  );

  router.post(
    '/',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = invoiceSchema.parse(req.body);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO invoices
            (invoice_number, client_name, client_email, client_company, client_phone, client_address,
             issue_date, due_date, subtotal, discount, tax, total, status, payment_instructions)
           VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()), $8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [
            body.invoice_number,
            body.client_name,
            body.client_email,
            body.client_company ?? null,
            body.client_phone ?? null,
            body.client_address ?? null,
            body.issue_date ?? null,
            body.due_date,
            body.subtotal,
            body.discount,
            body.tax,
            body.total,
            body.status,
            body.payment_instructions ?? null,
          ]
        );
        const invoice = result.rows[0];
        const insertedLineItems = await insertLineItems(client, invoice.id, body.line_items);
        await client.query('COMMIT');
        res.status(201).json({ ...invoice, line_items: insertedLineItems });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })
  );

  router.patch(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = invoiceSchema.partial().parse(req.body);
      const { line_items, ...fields } = body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const keys = Object.keys(fields);
        if (keys.length > 0) {
          const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
          const values = keys.map((key) => (fields as Record<string, unknown>)[key]);
          const updateResult = await client.query(
            `UPDATE invoices SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING id`,
            [req.params.id, ...values]
          );
          if (!updateResult.rows[0]) throw new HttpError(404, 'Invoice not found');
        }
        if (line_items) {
          await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [req.params.id]);
          await insertLineItems(client, req.params.id, line_items);
        }
        const invoice = await client.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
        if (!invoice.rows[0]) throw new HttpError(404, 'Invoice not found');
        const lineItemsResult = await client.query(
          'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at ASC',
          [req.params.id]
        );
        await client.query('COMMIT');
        res.json({ ...invoice.rows[0], line_items: lineItemsResult.rows });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })
  );

  router.delete(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rows[0]) throw new HttpError(404, 'Invoice not found');
      res.status(204).send();
    })
  );

  return router;
}
