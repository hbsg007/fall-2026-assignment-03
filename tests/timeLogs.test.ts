import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { insertTimeLog, getTotalHoursForTicket } from '../src/dal/timeLogs.js';

// tests/setup.ts truncates every table before each test, so each test
// starts with an empty database.

async function createUserAndTicket(): Promise<{
  userId: number;
  ticketId: number;
}> {
  const user = await request(app)
    .post('/users')
    .set('X-User-Id', '1')
    .send({ name: 'Dana Scott', email: 'dana@example.com' });
  expect(user.status).toBe(201);

  const ticket = await request(app)
    .post('/tickets')
    .set('X-User-Id', String(user.body.id))
    .send({ title: 'Build time tracking' });
  expect(ticket.status).toBe(201);

  return { userId: user.body.id, ticketId: ticket.body.id };
}

function logHours(ticketId: number, userId: number, hours: unknown) {
  return request(app)
    .post(`/tickets/${ticketId}/time`)
    .set('X-User-Id', String(userId))
    .send({ hours });
}

describe('Part 2: Time Logs Tests', () => {
  describe('POST /tickets/:id/time', () => {
    it('creates a time log with user_id from X-User-Id and returns 201', async () => {
      const { userId, ticketId } = await createUserAndTicket();

      const res = await logHours(ticketId, userId, 3);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        ticket_id: ticketId,
        user_id: userId,
        hours: 3,
      });
      expect(res.body).toHaveProperty('logged_at');
    });

    it('returns 401 when X-User-Id is missing', async () => {
      const { ticketId } = await createUserAndTicket();

      const res = await request(app)
        .post(`/tickets/${ticketId}/time`)
        .send({ hours: 2 });

      expect(res.status).toBe(401);
    });

    it.each([0, -2, '3', null, undefined, 'abc'])(
      'returns 400 when hours is invalid (%j)',
      async (badHours) => {
        const { userId, ticketId } = await createUserAndTicket();

        const res = await logHours(ticketId, userId, badHours);

        expect(res.status).toBe(400);
      },
    );

    it('returns 404 when the ticket does not exist', async () => {
      const { userId } = await createUserAndTicket();

      const res = await logHours(9999, userId, 2);

      expect(res.status).toBe(404);
    });

    it('returns 400 when the X-User-Id user does not exist', async () => {
      const { ticketId } = await createUserAndTicket();

      const res = await logHours(ticketId, 9999, 2);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /tickets/:id/time', () => {
    it('returns the correct sum of multiple time log entries', async () => {
      const { userId, ticketId } = await createUserAndTicket();

      for (const hours of [3, 2, 5]) {
        const res = await logHours(ticketId, userId, hours);
        expect(res.status).toBe(201);
      }

      const res = await request(app).get(`/tickets/${ticketId}/time`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ticket_id: ticketId, total_hours: 10 });
      expect(typeof res.body.total_hours).toBe('number');
    });

    it('sums fractional hours exactly', async () => {
      const { userId, ticketId } = await createUserAndTicket();

      for (const hours of [1.5, 2.25, 0.1, 0.2]) {
        await logHours(ticketId, userId, hours);
      }

      const res = await request(app).get(`/tickets/${ticketId}/time`);

      // 1.5 + 2.25 + 0.1 + 0.2 = 4.05 (no floating-point drift)
      expect(res.body).toEqual({ ticket_id: ticketId, total_hours: 4.05 });
    });

    it('sums hours logged by different users on the same ticket', async () => {
      const { userId, ticketId } = await createUserAndTicket();
      const second = await request(app)
        .post('/users')
        .set('X-User-Id', '1')
        .send({ name: 'Evan Patel', email: 'evan@example.com' });

      await logHours(ticketId, userId, 4);
      await logHours(ticketId, second.body.id, 6);

      const res = await request(app).get(`/tickets/${ticketId}/time`);

      expect(res.body.total_hours).toBe(10);
    });

    it('only counts hours for the requested ticket', async () => {
      const { userId, ticketId } = await createUserAndTicket();
      const other = await request(app)
        .post('/tickets')
        .set('X-User-Id', String(userId))
        .send({ title: 'Other ticket' });

      await logHours(ticketId, userId, 2);
      await logHours(ticketId, userId, 3);
      await logHours(other.body.id, userId, 100);

      const first = await request(app).get(`/tickets/${ticketId}/time`);
      const second = await request(app).get(`/tickets/${other.body.id}/time`);

      expect(first.body).toEqual({ ticket_id: ticketId, total_hours: 5 });
      expect(second.body).toEqual({
        ticket_id: other.body.id,
        total_hours: 100,
      });
    });

    it('returns 0 for a ticket with no time logged', async () => {
      const { ticketId } = await createUserAndTicket();

      const res = await request(app).get(`/tickets/${ticketId}/time`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ticket_id: ticketId, total_hours: 0 });
    });

    it('returns 404 when the ticket does not exist', async () => {
      const res = await request(app).get('/tickets/9999/time');
      expect(res.status).toBe(404);
    });
  });

  describe('DAL', () => {
    it('insertTimeLog returns the row with hours as a number', async () => {
      const { userId, ticketId } = await createUserAndTicket();

      const log = await insertTimeLog(ticketId, userId, 1.5);

      expect(log).toMatchObject({
        ticket_id: ticketId,
        user_id: userId,
        hours: 1.5,
      });
      expect(log.logged_at).toBeInstanceOf(Date);
    });

    it('getTotalHoursForTicket sums in SQL and returns a number', async () => {
      const { userId, ticketId } = await createUserAndTicket();
      await insertTimeLog(ticketId, userId, 7);
      await insertTimeLog(ticketId, userId, 8);

      await expect(getTotalHoursForTicket(ticketId)).resolves.toBe(15);
    });
  });
});