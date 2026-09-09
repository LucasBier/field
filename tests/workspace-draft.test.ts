import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../lib/field';
import { canonicalWorkspace } from '../lib/validation';
import {
  createDraft,
  draftDisposition,
  draftStore,
  DRAFT_WARNING,
} from '../lib/workspace-draft';

const scope = `guest:${'a'.repeat(64)}`;
function fixture() {
  const data = new Map<string, string>();
  return {
    data,
    store: draftStore(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    })),
  };
}
await test('unsaved state survives a tab reload and stays bound to its visitor', () => {
  const { data, store } = fixture();
  const w = initialWorkspace();
  w.profile.purpose = 'Recover this unsaved thought.';
  assert.equal(store.write(createDraft(scope, 4, w)), '');
  assert.deepEqual(store.read(scope).draft?.workspace, canonicalWorkspace(w));
  assert.equal(store.read(`guest:${'b'.repeat(64)}`).draft, null);
  assert.equal(store.read('workspace').draft, null);
  assert.equal(data.size, 1);
  store.remove(scope);
  assert.equal(store.read(scope).draft, null);
});
await test('an acknowledged earlier edit cannot make a later draft overwrite another server revision', () => {
  const original = initialWorkspace();
  const changed = structuredClone(original);
  changed.profile.purpose = 'The most recent unsaved edit';
  const draft = createDraft(scope, 4, changed);
  assert.equal(
    draftDisposition(draft, { scope, revision: 4, workspace: original }),
    'restorable',
  );
  assert.equal(
    draftDisposition(draft, { scope, revision: 5, workspace: original }),
    'conflict',
  );
  assert.equal(
    draftDisposition(draft, {
      scope: 'workspace',
      revision: 4,
      workspace: original,
    }),
    'foreign',
  );
  // A lost HTTP acknowledgement must not offer to reapply already saved actions.
  assert.equal(
    draftDisposition(draft, { scope, revision: 5, workspace: changed }),
    'saved',
  );
});
await test('draft recovery removes unknown credential fields and rejects corrupt or expired snapshots', () => {
  const { data, store } = fixture();
  const w = Object.assign(initialWorkspace(), {
    apiKey: 'never-persist-this',
    connection: { key: 'also-private' },
  });
  store.write(createDraft(scope, 0, w));
  const [key, raw] = [...data][0];
  assert.ok(
    !raw.includes('never-persist-this') && !raw.includes('also-private'),
  );
  for (const value of [
    '{broken',
    JSON.stringify({ ...JSON.parse(raw), revision: -1 }),
    JSON.stringify({ ...JSON.parse(raw), savedAt: 0 }),
    JSON.stringify({ ...JSON.parse(raw), scope: 'workspace' }),
  ]) {
    data.set(key, value);
    assert.equal(store.read(scope).draft, null);
    assert.equal(data.size, 0);
  }
});
await test('unavailable or full browser storage reports the missing recovery copy without losing in-memory work', () => {
  const w = initialWorkspace();
  const store = draftStore(() => {
    throw new Error('Storage denied');
  });
  assert.equal(store.write(createDraft(scope, 1, w)), DRAFT_WARNING);
  assert.equal(store.read(scope).warning, DRAFT_WARNING);
  assert.deepEqual(w, canonicalWorkspace(w));
});
