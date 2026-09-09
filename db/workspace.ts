import { ensureEntity } from '../lib/entity';
import { env } from 'cloudflare:workers';
import { initialWorkspace, type Workspace } from '../lib/field';
import { canonicalWorkspace } from '../lib/validation';
type Row = { data: string; revision: number };
const db = () => (env as unknown as { DB: D1Database }).DB;
export async function getWorkspace(workspaceId: string) {
  const results = await db().batch([
    db()
      .prepare(
        'INSERT OR IGNORE INTO workspaces (id, data, revision, updated_at) VALUES (?, ?, 0, ?)',
      )
      .bind(
        workspaceId,
        JSON.stringify(initialWorkspace()),
        new Date().toISOString(),
      ),
    db()
      .prepare('SELECT data, revision FROM workspaces WHERE id = ?')
      .bind(workspaceId),
  ]);
  const row = results[1].results[0] as Row;
  const stored = JSON.parse(row.data) as Workspace;
  const upgraded = ensureEntity(stored);
  if (upgraded !== stored) {
    if (await saveWorkspace(upgraded, row.revision, workspaceId))
      return { workspace: upgraded, revision: row.revision + 1 };
    const fresh = await db()
      .prepare('SELECT data, revision FROM workspaces WHERE id = ?')
      .bind(workspaceId)
      .first<Row>();
    if (!fresh) throw new Error('Workspace not found.');
    return {
      workspace: JSON.parse(fresh.data) as Workspace,
      revision: fresh.revision,
    };
  }
  return { workspace: stored, revision: row.revision };
}
export async function saveWorkspace(
  workspace: Workspace,
  expectedRevision: number,
  workspaceId: string,
) {
  const result = await db()
    .prepare(
      'UPDATE workspaces SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?',
    )
    .bind(
      JSON.stringify(canonicalWorkspace(workspace)),
      new Date().toISOString(),
      workspaceId,
      expectedRevision,
    )
    .run();
  return result.meta.changes === 1;
}
