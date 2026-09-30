import { Request, Response, NextFunction, RequestHandler } from 'express';

// Largest value a Postgres `integer` (serial) column can hold.
const MAX_PG_INTEGER = 2147483647;

/**
 * Parses a route param or header into a positive integer ID.
 * Returns null for anything that isn't a whole number from 1 up to the
 * Postgres integer limit (e.g. "abc", "1.5", "-3", "0", "").
 */
export function parseId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= MAX_PG_INTEGER ? id : null;
}

/**
 * Express 4 does not catch errors thrown by async handlers, so a failed
 * database call would hang the request. This wrapper forwards any rejected
 * promise to Express's error handler (see src/index.ts).
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/**
 * Returns the Postgres error code (e.g. '23505' unique violation,
 * '23503' foreign key violation) if the error came from the database.
 */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}