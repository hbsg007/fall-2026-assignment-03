import { sql } from 'kysely';
import { db, TimeLog } from '../db/database.js';

/**
 * Inserts one time log row and returns it.
 *
 * Postgres `numeric` values come back from the pg driver as strings
 * (e.g. "1.50"), so hours is converted to a number to match TimeLog's type.
 */
export async function insertTimeLog(
  ticketId: number,
  userId: number,
  hours: number,
): Promise<TimeLog> {
  const row = await db
    .insertInto('time_logs')
    .values({ ticket_id: ticketId, user_id: userId, hours })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { ...row, hours: Number(row.hours) };
}

/**
 * Returns the total hours logged against a ticket, summed in SQL:
 *
 *   SELECT COALESCE(SUM(hours), 0) AS total_hours
 *   FROM time_logs WHERE ticket_id = $1
 *
 * SUM returns NULL when there are no rows, so COALESCE turns that into 0.
 * The pg driver returns the numeric result as a string, hence Number(...).
 */
export async function getTotalHoursForTicket(
  ticketId: number,
): Promise<number> {
  const result = await db
    .selectFrom('time_logs')
    .select((eb) =>
      eb.fn
        .coalesce(eb.fn.sum<string | number>('hours'), sql<number>`0`)
        .as('total_hours'),
    )
    .where('ticket_id', '=', ticketId)
    .executeTakeFirstOrThrow();

  return Number(result.total_hours);
}