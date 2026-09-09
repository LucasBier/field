import test from 'node:test';
import assert from 'node:assert/strict';
import { storySample } from '../lib/story-sample';
import { retrieveMemories } from '../lib/memory';
import {
  beginTurn,
  completeTurn,
  stopTurn,
  classifyFailure,
} from '../lib/runtime';
import { canonicalWorkspace, validWorkspace } from '../lib/validation';
import { entityContext } from '../lib/entity';
import { localRequest, runAgent } from '../lib/inference';

await test('an old relevant memory survives a long stream of unrelated recent memories', () => {
  const w = storySample();
  for (let i = 0; i < 30; i++)
    w.memories.push({
      id: `recent-${i}`,
      text: `Project update ${i} is ready.`,
      source: 'user',
      createdAt: '2026-09-09T10:00:00Z',
    });
  const recalled = retrieveMemories(
    w.memories,
    'What coffee do I like in the morning?',
  );
  assert.equal(recalled.memories[0].id, 'sample-name');
  assert.ok(recalled.memories.some((m) => m.id === 'sample-morning'));
  assert.ok(!recalled.memories.some((m) => m.id.startsWith('recent-')));
  assert.ok(
    recalled.selection.matches.some(
      (m) => m.reason === 'relevant' && m.score > 0,
    ),
  );
});

await test('memory retrieval enforces budgets, pins and deterministic fallback without mutating originals', () => {
  const w = storySample();
  w.memories = Array.from({ length: 20 }, (_, i) => ({
    id: `m-${i}`,
    text: 'coffee '.repeat(428),
    source: 'user',
    createdAt: `2026-09-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
    pinned: i === 0,
  }));
  const before = JSON.stringify(w);
  const r = retrieveMemories(w.memories, 'coffee');
  assert.equal(r.memories[0].id, 'm-0');
  assert.equal(r.selection.chars, 6000);
  assert.equal(r.memories.length, 6);
  assert.ok(r.memories.every((m) => m.text.length === 1000));
  assert.ok(r.selection.matches.every((m) => m.truncated));
  assert.equal(JSON.stringify(w), before);
  assert.deepEqual(retrieveMemories(w.memories, 'coffee'), r);
  const fallback = retrieveMemories(storySample().memories, 'xyzzy');
  assert.equal(fallback.memories[0].id, 'sample-name');
  assert.equal(fallback.memories[1].id, 'sample-project');
  assert.equal(fallback.selection.matches[1].reason, 'recent');
  assert.equal(retrieveMemories([], '').selection.chars, 0);
});

await test('local prompts and persisted runs use the same recall plan without duplicating the new question', () => {
  const { workspace, run } = beginTurn(storySample(), 'coffee morning', {
    provider: 'ollama',
    model: 'test-model',
  });
  const payload = localRequest(workspace, 'coffee morning', 'test-model');
  const context = JSON.parse(payload.messages[1].content).context;
  assert.deepEqual(context.memorySelection, run.memory);
  assert.ok(
    !context.recentMessages.some(
      (m: { text: string }) => m.text === 'coffee morning',
    ),
  );
  assert.deepEqual(context, entityContext(workspace, 'coffee morning'));
  assert.ok(validWorkspace(workspace));
});

await test('a completed run commits its reply and action receipts once; duplicate delivery is rejected', () => {
  const { workspace, run } = beginTurn(storySample(), 'Go to the window', {
    provider: 'demo',
  });
  const next = completeTurn(
    workspace,
    run.id,
    {
      reply: 'Let’s continue by the window.',
      actions: [
        { type: 'move', zone: 'window' },
        { type: 'note', text: 'Tomorrow', zone: 'window' },
      ],
    },
    new AbortController().signal,
  );
  assert.equal(workspace.entity!.zone, 'center');
  assert.equal(next.entity!.zone, 'window');
  assert.equal(next.runs![0].status, 'completed');
  assert.equal(next.runs![0].receiptIds.length, 2);
  assert.equal(next.messages.at(-1)!.id, next.runs![0].replyId);
  assert.ok(validWorkspace(next));
  const saved = JSON.stringify(next);
  assert.throws(
    () =>
      completeTurn(
        next,
        run.id,
        { reply: 'Again', actions: [{ type: 'move', zone: 'desk' }] },
        new AbortController().signal,
      ),
    /already ended/,
  );
  assert.equal(JSON.stringify(next), saved);
});

await test('permission changes during inference reject an entire result and preserve a failure trace', () => {
  const { workspace, run } = beginTurn(storySample(), 'Move and leave a note', {
    provider: 'ollama',
    model: 'test-model',
  });
  workspace.entity!.permissions.notes = false;
  const saved = JSON.stringify(workspace);
  assert.throws(
    () =>
      completeTurn(
        workspace,
        run.id,
        {
          reply: 'A proposed change',
          actions: [
            { type: 'move', zone: 'window' },
            { type: 'note', text: 'Blocked', zone: 'window' },
          ],
        },
        new AbortController().signal,
      ),
    /Permission/,
  );
  assert.equal(JSON.stringify(workspace), saved);
  const failed = stopTurn(workspace, run.id, 'failed', 'permission');
  assert.equal(failed.entity!.zone, 'center');
  assert.equal(failed.messages.length, workspace.messages.length);
  assert.equal(failed.runs![0].failure, 'permission');
  assert.ok(validWorkspace(failed));
});

await test('cancellation, including a late model result, cannot apply pending actions', () => {
  const { workspace, run } = beginTurn(storySample(), 'Move', {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  });
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () =>
      completeTurn(
        workspace,
        run.id,
        { reply: 'Too late', actions: [{ type: 'move', zone: 'desk' }] },
        controller.signal,
      ),
    { name: 'AbortError' },
  );
  const cancelled = stopTurn(workspace, run.id, 'cancelled');
  assert.equal(cancelled.entity!.zone, 'center');
  assert.equal(cancelled.runs![0].receiptIds.length, 0);
  assert.ok(validWorkspace(cancelled));
  assert.throws(
    () =>
      completeTurn(
        cancelled,
        run.id,
        { reply: 'Late delivery', actions: [] },
        new AbortController().signal,
      ),
    /already ended/,
  );
});

await test('memory saves commit atomically with their source and run receipt', () => {
  const { workspace, run } = beginTurn(storySample(), 'Remember: I enjoy tea', {
    provider: 'demo',
  });
  const next = completeTurn(
    workspace,
    run.id,
    {
      reply: 'Kept.',
      actions: [],
      memory: {
        id: 'tea',
        text: 'I enjoy tea',
        source: 'user',
        createdAt: new Date().toISOString(),
      },
    },
    new AbortController().signal,
  );
  assert.equal(next.memories.at(-1)!.source, 'user');
  assert.equal(next.runs![0].receiptIds.length, 1);
  assert.ok(validWorkspace(next));
});

await test('run retention, deletion and export do not retain secret fields or copies of memory text', () => {
  let w = storySample();
  for (let i = 0; i < 45; i++) {
    const started = beginTurn(w, 'coffee', {
      provider: 'ollama',
      model: 'test',
    });
    w = stopTurn(
      started.workspace,
      started.run.id,
      'failed',
      classifyFailure(new Error('Provider rejected private-secret-key')),
    );
  }
  assert.equal(w.runs!.length, 40);
  assert.ok(validWorkspace(w));
  const polluted = structuredClone(w) as typeof w & { key?: string };
  polluted.key = 'private-secret-key';
  Object.assign(polluted.runs![0], {
    key: 'private-secret-key',
    prompt: 'private-secret-key',
  });
  Object.assign(polluted.runs![0].memory!, { rawText: 'private-secret-key' });
  Object.assign(polluted.runs![0].memory!.matches[0], {
    apiKey: 'private-secret-key',
  });
  polluted.memories = [];
  const clean = canonicalWorkspace(polluted);
  assert.ok(validWorkspace(clean));
  const serialized = JSON.stringify(clean);
  assert.ok(!serialized.includes('private-secret-key'));
  assert.ok(!serialized.includes('quiet mornings'));
  assert.equal(classifyFailure(new Error('Permission is off')), 'permission');
});

await test('invalid imported run metrics and forged terminal states are rejected', () => {
  const { workspace } = beginTurn(storySample(), 'coffee', {
    provider: 'ollama',
    model: 'test',
  });
  const bad = structuredClone(workspace);
  bad.runs![0].memory!.matches[0].score = Infinity;
  assert.equal(validWorkspace(bad), false);
  const forged = structuredClone(workspace);
  forged.runs![0].status = 'completed';
  assert.equal(validWorkspace(forged), false);
  const invalidPin = storySample();
  Object.assign(invalidPin.memories[0], { pinned: 'yes' });
  assert.equal(validWorkspace(invalidPin), false);
});

await test('a malformed hosted usage report cannot slip actions through the adapter', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      reply: 'Proposed move',
      actions: [{ type: 'move', zone: 'desk' }],
      usage: { input: -1, output: 5, total: 4 },
    });
  try {
    const w = storySample();
    await assert.rejects(
      runAgent(
        {
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          key: 'test-key-unused',
        },
        w,
        'Move',
        new AbortController().signal,
      ),
      /validated/,
    );
    assert.equal(w.entity!.zone, 'center');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
