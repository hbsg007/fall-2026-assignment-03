import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import usersRouter from './routes/users.js';
import ticketsRouter from './routes/tickets.js';

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/users', usersRouter);
app.use('/tickets', ticketsRouter);

// Unknown routes -> JSON 404 instead of Express's default HTML page
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Central error handler: malformed JSON -> 400, anything else -> 500.
// Express only treats a middleware as an error handler if it has 4 params.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  ) {
    res.status(400).json({ error: 'Request body must be valid JSON' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;