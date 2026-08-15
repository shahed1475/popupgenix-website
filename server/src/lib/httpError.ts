import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const PG_ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  '22P02': { status: 400, message: 'Invalid ID format' },
  '22007': { status: 400, message: 'Invalid date format' },
  '23505': { status: 409, message: 'Resource already exists' },
  '23503': { status: 400, message: 'Referenced resource does not exist' },
};

function isPgError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && 'code' in err && typeof (err as { code?: unknown }).code === 'string' &&
    /^[0-9A-Z]{5}$/.test((err as { code: string }).code);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.issues });
    return;
  }
  if (isPgError(err)) {
    const mapped = PG_ERROR_MESSAGES[err.code];
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
