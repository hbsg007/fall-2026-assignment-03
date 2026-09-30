/* eslint-disable @typescript-eslint/no-explicit-any */
import { Kysely, sql } from 'kysely';

// Part 2: time_logs table
// - hours is `numeric` so fractional entries like 1.5 are stored exactly
//   (no floating-point rounding when they are summed).
// - A CHECK constraint stops zero or negative hours at the database level.
// - ticket_id is indexed because every "total hours" query filters on it.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('time_logs')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('ticket_id', 'integer', (col) =>
      col.references('tickets.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'integer', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    .addColumn('hours', 'numeric', (col) => col.notNull())
    .addColumn('logged_at', 'timestamptz', (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addCheckConstraint('time_logs_hours_positive', sql`hours > 0`)
    .execute();

  await db.schema
    .createIndex('time_logs_ticket_id_idx')
    .on('time_logs')
    .column('ticket_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Dropping the table also drops its index and constraints.
  await db.schema.dropTable('time_logs').ifExists().execute();
}