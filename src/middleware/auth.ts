import { Request, Response, NextFunction } from 'express';
import { parseId } from '../utils/http.js';

/**
 * Requires a numeric X-User-Id header on routes that create or modify data.
 * - Missing or invalid header -> 401 Unauthorized
 * - Valid header -> the ID is stored on res.locals.userId for the next handler
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = parseId(req.header('X-User-Id'));

  if (userId === null) {
    res
      .status(401)
      .json({ error: 'A valid numeric X-User-Id header is required' });
    return;
  }

  res.locals.userId = userId;
  next();
}

export default authMiddleware;