import { env } from 'cloudflare:workers';
import { canonicalWorkspace } from '../lib/validation';
import type { Workspace } from '../lib/field';
import {
  HostedError,
  hostedConfig,
  utcDay,
  type HostedConfig,
  type HostedCode,
} from '../lib/hosted-config';
import { getWorkspace } from './workspace';
import { stopTurn } from '../lib/runtime';

export type HostedTurn = {
  id: string;
  workspace_id: string;
  fingerprint: string;
  run_id: string;
  day: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  reserved_micros: number;
  actual_micros: number | null;
  started_at: number;
  expires_at: number;
  failure: HostedCode | null;
};
const db = () => (env as unknown as { DB: D1Database }).DB;
export const siteConfig = () =>
  hostedConfig(env as unknown as Record<string, string>, import.meta.env.DEV);
export const findHostedTurn = (scope: string, id: string) =>
  db()
    .prepare('SELECT * FROM hosted_turns WHERE workspace_id = ? AND id = ?')
    .bind(scope, id)
    .first<HostedTurn>();
export async function hostedAllowance(scope: string, config: HostedConfig) {
  const value = await db()
    .prepare(
      'SELECT COUNT(*) AS turns FROM hosted_turns WHERE workspace_id = ? AND day = ? AND length(run_id) > 0',
    )
    .bind(scope, utcDay())
    .first<{ turns: number }>();
  return Math.max(0, config.visitorTurns - (value?.turns || 0));
}

/** The single conditional INSERT serializes all guest/site budget and concurrency checks. */
export async function reserveHostedTurn(
  scope: string,
  id: string,
  fingerprint: string,
  runId: string,
  workspace: Workspace,
  revision: number,
  reserved: number,
  config: HostedConfig,
) {
  const now = Date.now(),
    day = utcDay();
  const results = await db().batch([
    db()
      .prepare(`INSERT OR IGNORE INTO hosted_turns (id, workspace_id, fingerprint, run_id, day, status, reserved_micros, started_at, expires_at)
      SELECT ?, ?, ?, ?, ?, 'running', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = ? AND revision = ?)
        AND NOT EXISTS (SELECT 1 FROM hosted_turns WHERE workspace_id = ? AND status = 'running' AND expires_at > ?)
        AND (SELECT COUNT(*) FROM hosted_turns WHERE status = 'running' AND expires_at > ?) < ?
        AND (SELECT COUNT(*) FROM hosted_turns WHERE workspace_id = ? AND day = ? AND length(run_id) > 0) < ?
        AND (SELECT COUNT(*) FROM hosted_turns WHERE day = ? AND length(run_id) > 0) < ?
        AND (? = 1 OR (SELECT COALESCE(SUM(MAX(reserved_micros, COALESCE(actual_micros, 0))), 0) FROM hosted_turns WHERE day = ?) + ? <= ?)`)
      .bind(
        id,
        scope,
        fingerprint,
        runId,
        day,
        reserved,
        now,
        now + config.leaseMs,
        scope,
        revision,
        scope,
        now,
        now,
        config.concurrency,
        scope,
        day,
        config.visitorTurns,
        day,
        config.siteTurns,
        config.provider === 'ollama' ? 1 : 0,
        day,
        reserved,
        config.dailyMicros,
      ),
    db()
      .prepare(`UPDATE workspaces SET data = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM hosted_turns WHERE id = ? AND run_id = ? AND status = 'running')`)
      .bind(
        JSON.stringify(canonicalWorkspace(workspace)),
        new Date().toISOString(),
        scope,
        revision,
        id,
        runId,
      ),
  ]);
  if (results[0].meta.changes === 1 && results[1].meta.changes === 1) return;
  const duplicate = await findHostedTurn(scope, id);
  if (duplicate) throw new HostedError('conflict', 409);
  const totals = await db()
    .prepare(`SELECT
    (SELECT revision FROM workspaces WHERE id = ?) AS revision,
    (SELECT COUNT(*) FROM hosted_turns WHERE status = 'running' AND expires_at > ?) AS active,
    (SELECT COUNT(*) FROM hosted_turns WHERE workspace_id = ? AND status = 'running' AND expires_at > ?) AS own_active,
    (SELECT COUNT(*) FROM hosted_turns WHERE workspace_id = ? AND day = ? AND length(run_id) > 0) AS own_count,
    (SELECT COUNT(*) FROM hosted_turns WHERE day = ? AND length(run_id) > 0) AS total_count,
    (SELECT COALESCE(SUM(MAX(reserved_micros, COALESCE(actual_micros, 0))), 0) FROM hosted_turns WHERE day = ?) AS cost`)
    .bind(scope, now, scope, now, scope, day, day, day)
    .first<{
      revision: number;
      active: number;
      own_active: number;
      own_count: number;
      total_count: number;
      cost: number;
    }>();
  if (totals?.revision !== revision) throw new HostedError('conflict', 409);
  if (totals.own_active || totals.active >= config.concurrency)
    throw new HostedError('busy', 429);
  throw new HostedError('quota', 429);
}

export async function commitHostedTurn(
  scope: string,
  turn: HostedTurn,
  workspace: Workspace,
  revision: number,
  status: HostedTurn['status'],
  failure: HostedCode | null,
  actualMicros: number | null = null,
) {
  const serialized = JSON.stringify(canonicalWorkspace(workspace));
  const now = Date.now();
  const results = await db().batch([
    db()
      .prepare(`UPDATE workspaces SET data = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM hosted_turns WHERE id = ? AND workspace_id = ? AND status = 'running' AND (? != 'completed' OR expires_at > ?))`)
      .bind(
        serialized,
        new Date(now).toISOString(),
        scope,
        revision,
        turn.id,
        scope,
        status,
        now,
      ),
    db()
      .prepare(`UPDATE hosted_turns SET status = ?, failure = ?, actual_micros = ?
      WHERE id = ? AND workspace_id = ? AND status = 'running'
        AND EXISTS (SELECT 1 FROM workspaces WHERE id = ? AND revision = ? AND data = ?)`)
      .bind(
        status,
        failure,
        actualMicros,
        turn.id,
        scope,
        scope,
        revision + 1,
        serialized,
      ),
  ]);
  return results[0].meta.changes === 1 && results[1].meta.changes === 1;
}

export async function stopHostedTurn(
  scope: string,
  id: string,
  reason: HostedCode = 'cancelled',
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const turn = await findHostedTurn(scope, id);
    if (!turn) {
      // A stop may arrive before its start request. This tombstone prevents a late start.
      const tombstone = await db()
        .prepare(`INSERT OR IGNORE INTO hosted_turns (id, workspace_id, fingerprint, run_id, day, status, reserved_micros, started_at, expires_at, failure)
        SELECT ?, ?, '', '', ?, 'cancelled', 0, ?, ?, 'cancelled'
        WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = ?)
          AND (SELECT COUNT(*) FROM hosted_turns WHERE workspace_id = ? AND day = ? AND length(run_id) = 0) < 50
          AND (SELECT COUNT(*) FROM hosted_turns WHERE day = ? AND length(run_id) = 0) < 5000`)
        .bind(
          id,
          scope,
          utcDay(),
          Date.now(),
          Date.now(),
          scope,
          scope,
          utcDay(),
          utcDay(),
        )
        .run();
      if (!tombstone.meta.changes && !(await findHostedTurn(scope, id)))
        throw new HostedError('quota', 429);
      continue;
    }
    if (turn.status !== 'running') return turn;
    const saved = await getWorkspace(scope);
    const run = saved.workspace.runs?.find((r) => r.id === turn.run_id);
    const status = reason === 'cancelled' ? 'cancelled' : 'failed';
    const failure =
      reason === 'local_unavailable'
        ? 'provider'
        : [
              'cancelled',
              'timeout',
              'context_changed',
              'permission',
              'invalid_response',
              'provider',
              'storage',
            ].includes(reason)
          ? (reason as
              | 'cancelled'
              | 'timeout'
              | 'context_changed'
              | 'permission'
              | 'invalid_response'
              | 'provider'
              | 'storage')
          : 'unknown';
    const next =
      run?.status === 'running'
        ? stopTurn(saved.workspace, run.id, status, failure)
        : saved.workspace;
    if (
      await commitHostedTurn(scope, turn, next, saved.revision, status, reason)
    )
      return (await findHostedTurn(scope, id))!;
  }
  throw new HostedError('storage', 503);
}
export async function recoverHostedTurns(scope: string) {
  const expired = await db()
    .prepare(
      "SELECT id FROM hosted_turns WHERE workspace_id = ? AND status = 'running' AND expires_at <= ? LIMIT 5",
    )
    .bind(scope, Date.now())
    .all<{ id: string }>();
  for (const turn of expired.results)
    await stopHostedTurn(scope, turn.id, 'timeout');
}
