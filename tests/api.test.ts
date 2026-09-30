import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

// tests/setup.ts truncates every table before each test, so each test
// starts with an empty database.

async function createUser(
  name = 'Alice Chen',
  email = 'alice@example.com',
): Promise<{ id: number; name: string; email: string }> {
  const res = await request(app)
    .post('/users')
    .set('X-User-Id', '1')
    .send({ name, email });
  expect(res.status).toBe(201);
  return res.body;
}

async function createTicket(
  userId: number,
  title: string,
  description?: string,
): Promise<{ id: number; status: string }> {
  const res = await request(app)
    .post('/tickets')
    .set('X-User-Id', String(userId))
    .send({ title, description });
  expect(res.status).toBe(201);
  return res.body;
}

describe('Part 1: API Integration Tests', () => {
  describe('Auth middleware', () => {
    it('returns 401 when X-User-Id is missing on a POST', async () => {
      const res = await request(app)
        .post('/tickets')
        .send({ title: 'No header' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it.each(['abc', '1.5', '-3', '0', ''])(
      'returns 401 when X-User-Id is invalid (%j)',
      async (badId) => {
        const res = await request(app)
          .post('/tickets')
          .set('X-User-Id', badId)
          .send({ title: 'Bad header' });

        expect(res.status).toBe(401);
      },
    );

    it('returns 401 when X-User-Id is missing on a PATCH', async () => {
      const user = await createUser();
      const ticket = await createTicket(user.id, 'Patch me');

      const res = await request(app)
        .patch(`/tickets/${ticket.id}/status`)
        .send({ status: 'DONE' });

      expect(res.status).toBe(401);
    });

    it('does not require X-User-Id on GET requests', async () => {
      const res = await request(app).get('/tickets');
      expect(res.status).toBe(200);
    });
  });

  describe('User routes', () => {
    it('POST /users creates a user and returns 201', async () => {
      const res = await request(app)
        .post('/users')
        .set('X-User-Id', '1')
        .send({ name: 'Bob Martinez', email: 'bob@example.com' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: 'Bob Martinez',
        email: 'bob@example.com',
      });
      expect(res.body).toHaveProperty('created_at');
    });

    it('POST /users returns 400 when name or email is missing/invalid', async () => {
      const noName = await request(app)
        .post('/users')
        .set('X-User-Id', '1')
        .send({ email: 'x@example.com' });
      const badEmail = await request(app)
        .post('/users')
        .set('X-User-Id', '1')
        .send({ name: 'X', email: 'not-an-email' });

      expect(noName.status).toBe(400);
      expect(badEmail.status).toBe(400);
    });

    it('POST /users returns 409 for a duplicate email', async () => {
      await createUser('Alice', 'dup@example.com');
      const res = await request(app)
        .post('/users')
        .set('X-User-Id', '1')
        .send({ name: 'Alice Again', email: 'dup@example.com' });

      expect(res.status).toBe(409);
    });

    it('GET /users returns all users', async () => {
      await createUser('Alice', 'alice@example.com');
      await createUser('Bob', 'bob@example.com');

      const res = await request(app).get('/users');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((u: { name: string }) => u.name)).toEqual([
        'Alice',
        'Bob',
      ]);
    });

    it('GET /users/:id returns the user', async () => {
      const user = await createUser();
      const res = await request(app).get(`/users/${user.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: user.id, email: user.email });
    });

    it('GET /users/:id returns 404 for a non-existent user', async () => {
      const res = await request(app).get('/users/9999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /users/:id returns 400 for a non-numeric id', async () => {
      const res = await request(app).get('/users/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('Ticket routes', () => {
    it('POST /tickets creates a ticket with creator_id from the header', async () => {
      const user = await createUser();

      const res = await request(app)
        .post('/tickets')
        .set('X-User-Id', String(user.id))
        .send({ title: 'Fix login bug', description: 'Crashes on submit' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        title: 'Fix login bug',
        description: 'Crashes on submit',
        status: 'TODO',
        creator_id: user.id,
      });
    });

    it('POST /tickets returns 400 when title is missing', async () => {
      const user = await createUser();
      const res = await request(app)
        .post('/tickets')
        .set('X-User-Id', String(user.id))
        .send({ description: 'No title' });

      expect(res.status).toBe(400);
    });

    it('POST /tickets returns 400 when the X-User-Id user does not exist', async () => {
      const res = await request(app)
        .post('/tickets')
        .set('X-User-Id', '9999')
        .send({ title: 'Orphan ticket' });

      expect(res.status).toBe(400);
    });

    it('POST /tickets returns 400 for malformed JSON', async () => {
      const res = await request(app)
        .post('/tickets')
        .set('X-User-Id', '1')
        .set('Content-Type', 'application/json')
        .send('{"title": ');

      expect(res.status).toBe(400);
    });

    it('GET /tickets/:id returns the ticket', async () => {
      const user = await createUser();
      const ticket = await createTicket(user.id, 'Find me');

      const res = await request(app).get(`/tickets/${ticket.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: ticket.id, title: 'Find me' });
    });

    it('GET /tickets/:id returns 404 for a non-existent ticket', async () => {
      const res = await request(app).get('/tickets/9999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('PATCH /tickets/:id/status updates the status and returns 200', async () => {
      const user = await createUser();
      const ticket = await createTicket(user.id, 'Move me');

      const res = await request(app)
        .patch(`/tickets/${ticket.id}/status`)
        .set('X-User-Id', String(user.id))
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: ticket.id, status: 'IN_PROGRESS' });

      const check = await request(app).get(`/tickets/${ticket.id}`);
      expect(check.body.status).toBe('IN_PROGRESS');
    });

    it('PATCH /tickets/:id/status returns 400 for an invalid status', async () => {
      const user = await createUser();
      const ticket = await createTicket(user.id, 'Move me');

      const res = await request(app)
        .patch(`/tickets/${ticket.id}/status`)
        .set('X-User-Id', String(user.id))
        .send({ status: 'NOT_A_STATUS' });

      expect(res.status).toBe(400);
    });

    it('PATCH /tickets/:id/status returns 404 for a non-existent ticket', async () => {
      const res = await request(app)
        .patch('/tickets/9999/status')
        .set('X-User-Id', '1')
        .send({ status: 'DONE' });

      expect(res.status).toBe(404);
    });
  });

  describe('Pagination and filtering on GET /tickets', () => {
    it('returns every ticket when no query params are given', async () => {
      const user = await createUser();
      for (let i = 1; i <= 5; i++) {
        await createTicket(user.id, `Ticket ${i}`);
      }

      const res = await request(app).get('/tickets');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(5);
    });

    it('applies limit and offset', async () => {
      const user = await createUser();
      for (let i = 1; i <= 5; i++) {
        await createTicket(user.id, `Ticket ${i}`);
      }

      const page1 = await request(app).get('/tickets?limit=2&offset=0');
      const page2 = await request(app).get('/tickets?limit=2&offset=2');
      const page3 = await request(app).get('/tickets?limit=2&offset=4');

      const titles = (res: request.Response) =>
        res.body.map((t: { title: string }) => t.title);

      expect(page1.status).toBe(200);
      expect(titles(page1)).toEqual(['Ticket 1', 'Ticket 2']);
      expect(titles(page2)).toEqual(['Ticket 3', 'Ticket 4']);
      expect(titles(page3)).toEqual(['Ticket 5']);
    });

    it('filters by status', async () => {
      const user = await createUser();
      const a = await createTicket(user.id, 'A');
      await createTicket(user.id, 'B');
      const c = await createTicket(user.id, 'C');

      for (const ticket of [a, c]) {
        await request(app)
          .patch(`/tickets/${ticket.id}/status`)
          .set('X-User-Id', String(user.id))
          .send({ status: 'DONE' });
      }

      const done = await request(app).get('/tickets?status=DONE');
      const todo = await request(app).get('/tickets?status=TODO');

      expect(done.status).toBe(200);
      expect(done.body.map((t: { title: string }) => t.title)).toEqual([
        'A',
        'C',
      ]);
      expect(todo.body.map((t: { title: string }) => t.title)).toEqual(['B']);
    });

    it('combines status filter with pagination', async () => {
      const user = await createUser();
      for (let i = 1; i <= 4; i++) {
        await createTicket(user.id, `Todo ${i}`);
      }

      const res = await request(app).get(
        '/tickets?status=TODO&limit=1&offset=1',
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Todo 2');
    });

    it('returns 400 for invalid limit, offset or status', async () => {
      const badLimit = await request(app).get('/tickets?limit=abc');
      const badOffset = await request(app).get('/tickets?offset=-1');
      const badStatus = await request(app).get('/tickets?status=WHATEVER');

      expect(badLimit.status).toBe(400);
      expect(badOffset.status).toBe(400);
      expect(badStatus.status).toBe(400);
    });
  });
});