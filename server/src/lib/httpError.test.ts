import { describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';
import type { Request, Response } from 'express';
import { HttpError, errorHandler } from './httpError.js';

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  it('handles HttpError with its status and message', () => {
    const res = mockRes();
    errorHandler(new HttpError(404, 'Not found'), {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  it('handles ZodError as a 400', () => {
    const res = mockRes();
    let zodError: ZodError | undefined;
    try {
      z.object({ email: z.string().email() }).parse({ email: 'not-an-email' });
    } catch (err) {
      zodError = err as ZodError;
    }
    errorHandler(zodError, {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles unknown errors as a 500', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('maps a Postgres invalid_text_representation error (bad UUID) to a 400', () => {
    const res = mockRes();
    const err = Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' });
    errorHandler(err, {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID format' });
  });

  it('maps a Postgres invalid_datetime_format error to a 400', () => {
    const res = mockRes();
    const err = Object.assign(new Error('invalid input syntax for type date'), { code: '22007' });
    errorHandler(err, {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid date format' });
  });

  it('maps a Postgres unique_violation error to a 409', () => {
    const res = mockRes();
    const err = Object.assign(new Error('duplicate key value'), { code: '23505' });
    errorHandler(err, {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Resource already exists' });
  });

  it('maps a Postgres foreign_key_violation error to a 400', () => {
    const res = mockRes();
    const err = Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
    errorHandler(err, {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Referenced resource does not exist' });
  });

  it('falls back to 500 for an unmapped pg-shaped error code', () => {
    const res = mockRes();
    const err = Object.assign(new Error('some other pg error'), { code: '55006' });
    errorHandler(err, {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
