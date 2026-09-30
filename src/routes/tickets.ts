import { Router } from 'express';
import {
  getAllTickets,
  getTicketById,
  createTicket,
  updateTicketStatus,
  GetAllTicketsOptions,
} from '../dal/tickets.js';
import { insertTimeLog, getTotalHoursForTicket } from '../dal/timeLogs.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler, parseId, pgErrorCode } from '../utils/http.js';

const router = Router();

export const TICKET_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;

function isValidStatus(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Parses an optional non-negative integer query param (limit / offset).
 * Returns undefined when the param is absent and null when it is invalid.
 */
function parseQueryInt(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Part 1: Ticket routes
// ---------------------------------------------------------------------------

// GET /tickets?limit=10&offset=0&status=TODO
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = parseQueryInt(req.query.limit);
    const offset = parseQueryInt(req.query.offset);
    const { status } = req.query;

    if (limit === null) {
      res.status(400).json({ error: 'limit must be a non-negative integer' });
      return;
    }
    if (offset === null) {
      res.status(400).json({ error: 'offset must be a non-negative integer' });
      return;
    }
    if (status !== undefined && !isValidStatus(status)) {
      res.status(400).json({
        error: `status must be one of: ${TICKET_STATUSES.join(', ')}`,
      });
      return;
    }

    const options: GetAllTicketsOptions = { limit, offset, status };
    const tickets = await getAllTickets(options);
    res.status(200).json(tickets);
  }),
);

// GET /tickets/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Ticket id must be a positive integer' });
      return;
    }

    const ticket = await getTicketById(id);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    res.status(200).json(ticket);
  }),
);

// POST /tickets - creator_id comes from the X-User-Id header
router.post(
  '/',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { title, description } = req.body ?? {};
    const creatorId = res.locals.userId as number;

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required and must be a string' });
      return;
    }
    if (title.trim().length > 255) {
      res.status(400).json({ error: 'title must be 255 characters or fewer' });
      return;
    }
    if (
      description !== undefined &&
      description !== null &&
      typeof description !== 'string'
    ) {
      res.status(400).json({ error: 'description must be a string' });
      return;
    }

    try {
      const ticket = await createTicket({
        title: title.trim(),
        description: description ?? null,
        creator_id: creatorId,
      });
      res.status(201).json(ticket);
    } catch (err) {
      // 23503 = foreign_key_violation (creator_id points at a missing user)
      if (pgErrorCode(err) === '23503') {
        res
          .status(400)
          .json({ error: `User ${creatorId} (X-User-Id) does not exist` });
        return;
      }
      throw err;
    }
  }),
);

// PATCH /tickets/:id/status - body: { status: 'TODO' | 'IN_PROGRESS' | 'DONE' }
router.patch(
  '/:id/status',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Ticket id must be a positive integer' });
      return;
    }

    const { status } = req.body ?? {};
    if (!isValidStatus(status)) {
      res.status(400).json({
        error: `status must be one of: ${TICKET_STATUSES.join(', ')}`,
      });
      return;
    }

    const ticket = await updateTicketStatus(id, status);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    res.status(200).json(ticket);
  }),
);

// ---------------------------------------------------------------------------
// Part 2: Time log routes
// ---------------------------------------------------------------------------

// POST /tickets/:id/time - body: { hours: number }; user_id comes from X-User-Id
router.post(
  '/:id/time',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) {
      res.status(400).json({ error: 'Ticket id must be a positive integer' });
      return;
    }

    const { hours } = req.body ?? {};
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
      res.status(400).json({ error: 'hours must be a positive number' });
      return;
    }

    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${ticketId} not found` });
      return;
    }

    const userId = res.locals.userId as number;
    try {
      const timeLog = await insertTimeLog(ticketId, userId, hours);
      res.status(201).json(timeLog);
    } catch (err) {
      // 23503 = foreign_key_violation (user_id points at a missing user)
      if (pgErrorCode(err) === '23503') {
        res
          .status(400)
          .json({ error: `User ${userId} (X-User-Id) does not exist` });
        return;
      }
      throw err;
    }
  }),
);

// GET /tickets/:id/time - returns { ticket_id, total_hours }
router.get(
  '/:id/time',
  asyncHandler(async (req, res) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) {
      res.status(400).json({ error: 'Ticket id must be a positive integer' });
      return;
    }

    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${ticketId} not found` });
      return;
    }

    const totalHours = await getTotalHoursForTicket(ticketId);
    res.status(200).json({ ticket_id: ticketId, total_hours: totalHours });
  }),
);

export default router;