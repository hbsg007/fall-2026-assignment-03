import { Router } from 'express';
import { getAllUsers, getUserById, createUser } from '../dal/users.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler, parseId, pgErrorCode } from '../utils/http.js';

const router = Router();

// Simple "something@something.something" check with no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /users - return every user
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await getAllUsers();
    res.status(200).json(users);
  }),
);

// GET /users/:id - return one user, or 404 if it doesn't exist
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'User id must be a positive integer' });
      return;
    }

    const user = await getUserById(id);
    if (!user) {
      res.status(404).json({ error: `User ${id} not found` });
      return;
    }

    res.status(200).json(user);
  }),
);

// POST /users - create a user from { name, email }
router.post(
  '/',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { name, email } = req.body ?? {};

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required and must be a string' });
      return;
    }
    if (name.trim().length > 255) {
      res.status(400).json({ error: 'name must be 255 characters or fewer' });
      return;
    }
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      res.status(400).json({ error: 'email is required and must be valid' });
      return;
    }
    if (email.trim().length > 255) {
      res.status(400).json({ error: 'email must be 255 characters or fewer' });
      return;
    }

    try {
      const user = await createUser({
        name: name.trim(),
        email: email.trim(),
      });
      res.status(201).json(user);
    } catch (err) {
      // 23505 = unique_violation (the email column is UNIQUE)
      if (pgErrorCode(err) === '23505') {
        res
          .status(409)
          .json({ error: 'A user with that email already exists' });
        return;
      }
      throw err;
    }
  }),
);

export default router;