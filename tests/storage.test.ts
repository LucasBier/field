import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../lib/field';
import { beginTurn, completeTurn } from '../lib/runtime';
import { applyMemoryRepair, previewMemoryRepair } from '../lib/memory-repair';
import { retrieveMemories } from '../lib/memory';
const url = process.env.FIELD_TEST_URL;
await test(
  'D1 persistence, conflict rejection, and request boundaries',
  { skip: !url },
  async () => {
    let cookie = '';
    const load = async () => {
      const r = await fetch(`${url}/api/workspace`, {
        headers: cookie ? { Cookie: cookie } : {},
      });
      assert.equal(r.status, 200);
      cookie = r.headers.get('set-cookie')?.split(';')[0] || cookie;
      return (await r.json()) as {
        workspace: ReturnType<typeof initialWorkspace>;
        revision: number;
        scope: string;
      };
    };
    const original = await load();
    let ownRevision = original.revision;
    const put = (workspace: unknown, revision: number, origin = url!) =>
      fetch(`${url}/api/workspace`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          Cookie: cookie,
        },
        body: JSON.stringify({ workspace, revision, scope: original.scope }),
      });
    try {
      let draft = structuredClone(original.workspace);
      draft.profile.purpose = 'Temporary persistence verification.';
      draft.memories = [
        {
          id: 'storage-test-memory',
          text: 'Coffee in the morning',
          source: 'user',
          createdAt: new Date().toISOString(),
          pinned: true,
        },
      ];
      const started = beginTurn(draft, 'A coffee morning', {
        provider: 'ollama',
        model: 'mock-storage-check',
      });
      draft = completeTurn(
        started.workspace,
        started.run.id,
        {
          reply: 'Persistence test only.',
          actions: [{ type: 'task', title: 'Make morning coffee' }],
          usage: { input: 30, output: 5, total: 35 },
        },
        new AbortController().signal,
      );
      const first = await put(draft, ownRevision);
      assert.equal(first.status, 200);
      ownRevision = ((await first.json()) as { revision: number }).revision;
      const reread = await load();
      assert.deepEqual(reread.workspace, draft);
      assert.equal(reread.revision, ownRevision);
      const preview = previewMemoryRepair(
        reread.workspace,
        'storage-test-memory',
        'Tea suits me better in the morning now.',
      );
      draft = applyMemoryRepair(
        reread.workspace,
        preview,
        preview.items.map((item) => ({
          key: item.key,
          action: 'rewrite',
          text: 'Make morning tea',
        })),
      );
      const repair = await put(draft, ownRevision);
      assert.equal(repair.status, 200);
      ownRevision = ((await repair.json()) as { revision: number }).revision;
      const repaired = await load();
      assert.deepEqual(repaired.workspace, draft);
      assert.equal(repaired.workspace.memoryVersion, 1);
      assert.equal(
        repaired.workspace.entity!.tasks.at(-1)!.title,
        'Make morning tea',
      );
      assert.ok(
        !retrieveMemories(repaired.workspace.memories, 'coffee').memories.some(
          (m) => m.id === 'storage-test-memory',
        ),
      );
      assert.equal(
        (await put(original.workspace, original.revision)).status,
        409,
      );
      const bad = structuredClone(draft);
      bad.experiments[0].params.gravity = -5;
      assert.equal((await put(bad, ownRevision)).status, 400);
      assert.equal(
        (await put(draft, ownRevision, 'https://unrelated.example')).status,
        403,
      );
      assert.deepEqual((await load()).workspace, draft);
      const missingKey = await fetch(`${url}/api/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: url!,
          Cookie: cookie,
        },
        body: JSON.stringify({
          key: '',
          workspace: draft,
          message: 'Try Moon gravity',
          model: 'deepseek-v4-flash',
        }),
      });
      assert.equal(missingKey.status, 400);
      const forbidden = await fetch(`${url}/api/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://unrelated.example',
        },
        body: '{}',
      });
      assert.equal(forbidden.status, 403);
    } finally {
      const restore = await put(original.workspace, ownRevision);
      assert.equal(
        restore.status,
        200,
        'Restore only our own revision; never overwrite concurrent user edits.',
      );
    }
  },
);
