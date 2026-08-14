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
});
