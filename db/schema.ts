import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
export const hostedTurns = sqliteTable(
  'hosted_turns',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    runId: text('run_id').notNull(),
    day: text('day').notNull(),
    status: text('status').notNull(),
    reservedMicros: integer('reserved_micros').notNull(),
    actualMicros: integer('actual_micros'),
    startedAt: integer('started_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    failure: text('failure'),
  },
  (t) => [
    index('idx_hosted_turns_day').on(t.day),
    index('idx_hosted_turns_workspace_day').on(t.workspaceId, t.day),
    index('idx_hosted_turns_status_expiry').on(t.status, t.expiresAt),
  ],
);
