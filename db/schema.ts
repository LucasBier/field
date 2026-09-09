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

export const xOauthStates = sqliteTable(
  'x_oauth_states',
  {
    id: text('id').primaryKey(),
    browserHash: text('browser_hash').notNull(),
    verifier: text('verifier').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_x_oauth_expiry').on(t.expiresAt)],
);
export const xConnections = sqliteTable('x_connections', {
  userId: text('user_id').primaryKey(),
  username: text('username').notNull(),
  name: text('name').notNull(),
  tokens: text('tokens').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revision: integer('revision').notNull(),
  leaseUntil: integer('lease_until').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

export const niaDrafts = sqliteTable(
  'nia_drafts',
  {
    id: text('id').primaryKey(),
    brief: text('brief').notNull(),
    candidate: text('candidate'),
    phase: text('phase').notNull(),
    revision: integer('revision').notNull(),
    fingerprint: text('fingerprint'),
    postId: text('post_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_nia_drafts_created').on(t.createdAt),
    index('idx_nia_drafts_phase').on(t.phase),
  ],
);
