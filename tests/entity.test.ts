import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialWorkspace,
  COMPANION_PURPOSE,
  LEGACY_PURPOSE,
} from '../lib/field';
import {
  ensureEntity,
  applyEntityActions,
  entityContext,
  validEntityActions,
  receipt,
  entityDemo,
} from '../lib/entity';
import { canonicalWorkspace, validWorkspace } from '../lib/validation';
import { localRequest, runAgent, discoverLocalModels } from '../lib/inference';

await test('legacy workspaces gain an identity without losing history or experiments', () => {
  const old = initialWorkspace();
  old.memories.push({
    id: 'remember-one',
    text: 'I like tangible examples.',
    source: 'user',
    createdAt: '2026-09-09T00:00:00Z',
  });
  const next = ensureEntity(old);
  assert.ok(next.entity?.id);
  assert.deepEqual(next.memories, old.memories);
  assert.deepEqual(next.experiments, old.experiments);
  assert.deepEqual(next.messages, old.messages);
  assert.equal(ensureEntity(next).entity?.id, next.entity?.id);
  assert.ok(validWorkspace(next));
});
await test('companion upgrade preserves the existing identity and custom personality', () => {
  const w = ensureEntity(initialWorkspace());
  w.profile.purpose = LEGACY_PURPOSE;
  const upgraded = ensureEntity(w);
  assert.equal(upgraded.entity, w.entity);
  assert.equal(upgraded.profile.purpose, COMPANION_PURPOSE);
  assert.deepEqual(upgraded.messages, w.messages);
  assert.equal(ensureEntity(upgraded), upgraded);
  w.profile.purpose = 'My own personality and shared story.';
  assert.equal(ensureEntity(w), w);
  assert.equal(w.profile.purpose, 'My own personality and shared story.');
});
await test('companion demo recalls only saved user memories and never creates a relationship', () => {
  const w = ensureEntity(initialWorkspace());
  assert.match(
    entityDemo('What do you remember about me?', w).reply,
    /just beginning/,
  );
  w.memories.push({
    id: 'day',
    text: 'I like slow mornings.',
    source: 'user',
    createdAt: '2026-09-09T00:00:00Z',
  });
  const saved = JSON.stringify(w);
  const reply = entityDemo('What do you remember about me?', w);
  assert.match(reply.reply, /I like slow mornings/);
  assert.deepEqual(reply.actions, []);
  assert.deepEqual(entityDemo('Can you be my partner?', w).actions, []);
  assert.equal(JSON.stringify(w), saved);
});
await test('model handoffs preserve identity, relationships, tasks, notes and permissions', () => {
  let w = ensureEntity(initialWorkspace());
  w = applyEntityActions(
    w,
    [
      { type: 'task', title: 'Finish our shared project' },
      { type: 'note', text: 'Pick up here tomorrow', zone: 'desk' },
      { type: 'move', zone: 'desk' },
    ],
    'you',
  );
  w.entity!.relationships.push({
    id: 'collaborator',
    name: 'Alex',
    role: 'Collaborator',
    context: 'Prefers direct updates',
    createdAt: '2026-09-09T00:00:00Z',
  });
  w.entity!.permissions.notes = false;
  const before = structuredClone(w.entity);
  w = receipt(
    w,
    'connection_selected',
    'Selected a local model.',
    'you',
    'local-model',
  );
  assert.equal(w.entity!.id, before!.id);
  assert.deepEqual(w.entity!.tasks, before!.tasks);
  assert.deepEqual(w.entity!.relationships, before!.relationships);
  assert.deepEqual(w.entity!.permissions, before!.permissions);
  assert.deepEqual(w.entity!.notes, before!.notes);
  assert.equal(w.entity!.zone, 'desk');
  const context = entityContext(w);
  const payload = localRequest(w, 'What remains open?', 'local-model');
  assert.deepEqual(JSON.parse(payload.messages[1].content).context, context);
  assert.ok(validWorkspace(w));
});
await test('a denied action rejects the complete batch without partial mutation', () => {
  const w = ensureEntity(initialWorkspace());
  w.entity!.permissions.notes = false;
  const saved = JSON.stringify(w);
  assert.throws(
    () =>
      applyEntityActions(w, [
        { type: 'move', zone: 'window' },
        { type: 'note', text: 'Blocked note', zone: 'window' },
      ]),
    /Permission is off/,
  );
  assert.equal(JSON.stringify(w), saved);
  assert.equal(
    applyEntityActions(
      w,
      [{ type: 'note', text: 'Direct user action', zone: 'window' }],
      'you',
    ).entity!.notes.length,
    1,
  );
});
await test('tasks are records, completions must target existing tasks, and actions get receipts', () => {
  const w = ensureEntity(initialWorkspace());
  const next = applyEntityActions(w, [{ type: 'task', title: 'Read a paper' }]);
  assert.equal(next.entity!.tasks[0].state, 'open');
  assert.equal(next.entity!.receipts[0].action, 'task');
  assert.equal(next.entity!.receipts[0].actor, 'agent');
  assert.throws(
    () =>
      applyEntityActions(next, [{ type: 'complete_task', taskId: 'invented' }]),
    /missing/,
  );
  const done = applyEntityActions(
    next,
    [{ type: 'complete_task', taskId: next.entity!.tasks[0].id }],
    'you',
  );
  assert.equal(done.entity!.tasks[0].state, 'done');
  assert.ok(done.entity!.tasks[0].completedAt);
});
await test('agent exports retain portable state and omit unknown credential fields', () => {
  const w = ensureEntity(initialWorkspace());
  const portable = canonicalWorkspace({
    ...w,
    key: 'secret-not-exported',
    entity: { ...w.entity!, apiKey: 'also-secret' },
  } as typeof w);
  assert.ok(validWorkspace(portable));
  assert.equal(portable.entity?.id, w.entity?.id);
  assert.ok(!JSON.stringify(portable).includes('secret'));
  assert.equal(
    validEntityActions([{ type: 'move', zone: 'physical-room' }]),
    false,
  );
  assert.equal(
    validEntityActions([{ type: 'run_code', code: 'alert(1)' }]),
    false,
  );
});
await test('local adapter sends context only to loopback and validates replies', async (t) => {
  const w = ensureEntity(initialWorkspace());
  const calls: { url: string; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (url.endsWith('/api/tags'))
      return Response.json({ models: [{ name: 'test-model' }] });
    return Response.json({
      done: true,
      done_reason: 'stop',
      message: {
        content: JSON.stringify({
          reply: 'I can move to the desk.',
          actions: [{ type: 'move', zone: 'desk' }],
        }),
      },
      prompt_eval_count: 120,
      eval_count: 30,
    });
  });
  assert.deepEqual(await discoverLocalModels(), ['test-model']);
  const answer = await runAgent(
    { provider: 'ollama', model: 'test-model' },
    w,
    'Move to the desk',
    new AbortController().signal,
  );
  assert.equal(answer.usage?.total, 150);
  assert.ok(
    calls.every((c) => c.url.startsWith('http://localhost:11434/api/')),
  );
  assert.equal(w.entity!.zone, 'center');
  assert.equal(answer.actions[0].type, 'move');
});
await test('local adapter rejects unsupported model output', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      done: true,
      message: {
        content: JSON.stringify({
          reply: 'Running code',
          actions: [{ type: 'run_code' }],
        }),
      },
    }),
  );
  await assert.rejects(
    () =>
      runAgent(
        { provider: 'ollama', model: 'test-model' },
        ensureEntity(initialWorkspace()),
        'Do something',
        new AbortController().signal,
      ),
    /unsupported action/,
  );
});
