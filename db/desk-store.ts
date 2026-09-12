import { DeskError, newDesk, type DeskState } from '../lib/desk';

export class DeskStore {
  constructor(private db: D1Database) {}
  async read(scope: string): Promise<{ state: DeskState; revision: number }> {
    const row = await this.db
      .prepare(
        'SELECT data, revision FROM desk_sessions WHERE workspace_id = ?',
      )
      .bind(scope)
      .first<{ data: string; revision: number }>();
    return row
      ? { state: JSON.parse(row.data), revision: row.revision }
      : { state: newDesk(), revision: -1 };
  }
  async findBridge(hash: string) {
    return this.db
      .prepare('SELECT workspace_id FROM desk_sessions WHERE bridge_hash = ?')
      .bind(hash)
      .first<{ workspace_id: string }>();
  }
  async change(
    scope: string,
    apply: (s: DeskState) => DeskState,
  ): Promise<DeskState> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { state, revision } = await this.read(scope);
      const before = JSON.stringify(state);
      const next = apply(state),
        data = JSON.stringify(next);
      if (data.length > 900000)
        throw new DeskError(
          'The desk record is full. Export it before continuing.',
        );
      if (revision >= 0 && before === data) return next;
      const query =
        revision < 0
          ? this.db
              .prepare(
                'INSERT OR IGNORE INTO desk_sessions (workspace_id, data, revision, bridge_hash, updated_at) VALUES (?, ?, 0, ?, ?)',
              )
              .bind(scope, data, next.device.bridgeHash ?? null, Date.now())
          : this.db
              .prepare(
                'UPDATE desk_sessions SET data = ?, revision = revision + 1, bridge_hash = ?, updated_at = ? WHERE workspace_id = ? AND revision = ?',
              )
              .bind(
                data,
                next.device.bridgeHash ?? null,
                Date.now(),
                scope,
                revision,
              );
      if ((await query.run()).meta.changes === 1) return next;
    }
    throw new DeskError(
      'The desk changed in another session. Refresh its state before trying again.',
    );
  }
}
