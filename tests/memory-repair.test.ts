import test from 'node:test';
import assert from 'node:assert/strict';
import { repairSample } from '../lib/story-sample';
import {
  applyMemoryRepair,
  previewMemoryRepair,
  type RepairPreview,
} from '../lib/memory-repair';
import {
  activeMemories,
  currentMessages,
  retrieveMemories,
} from '../lib/memory';
import {
  applyEntityActions,
  entityContext,
  entityDemo,
  receipt,
} from '../lib/entity';
import {
  beginTurn,
  completeTurn,
  stopTurn,
  classifyFailure,
} from '../lib/runtime';
import { canonicalWorkspace, validWorkspace } from '../lib/validation';
import { evidenceMemory } from '../lib/field';
import { localRequest, runAgent } from '../lib/inference';

const correction =
  'I avoided parties during a difficult month. Ask what sounds good now.';
const keep = (p: RepairPreview) =>
  p.items.map((item) => ({ key: item.key, action: 'keep' as const }));
function corrected() {
  const w = repairSample();
  const preview = previewMemoryRepair(w, 'sample-social', correction);
  return applyMemoryRepair(w, preview, keep(preview));
}

await test('a correction preserves the original, retires even pinned old wording, and leaves unrelated state intact', () => {
  const w = repairSample();
  w.memories[0].pinned = true;
  const original = structuredClone(w);
  const preview = previewMemoryRepair(w, 'sample-social', correction);
  assert.equal(preview.items[0].contextMatch, true);
  const next = applyMemoryRepair(w, preview, keep(preview));
  assert.deepEqual(w, original);
  assert.equal(next.memoryVersion, 1);
  const old = next.memories.find((m) => m.id === 'sample-social')!;
  const revised = next.memories.find((m) => m.id === old.supersededBy)!;
  assert.equal(old.text, original.memories[0].text);
  assert.equal(revised.supersedes, old.id);
  assert.equal(revised.pinned, true);
  assert.equal(revised.text, correction);
  for (const query of ['', 'parties', 'quiet mornings', 'unknown-query'])
    assert.ok(
      !retrieveMemories(next.memories, query).memories.some(
        (m) => m.id === old.id,
      ),
    );
  assert.deepEqual(
    next.memories.find((m) => m.id === 'sample-morning'),
    original.memories[1],
  );
  assert.deepEqual(next.entity!.tasks, original.entity!.tasks);
  assert.deepEqual(next.profile, original.profile);
  assert.equal(next.entity!.id, original.entity!.id);
  assert.ok(validWorkspace(next));
});

await test('a review includes recorded exposure and unlinked records; only explicit choices change plans or notes', () => {
  let w = repairSample();
  w = applyEntityActions(
    w,
    [
      { type: 'task', title: 'Buy coffee' },
      { type: 'note', text: 'A thought', zone: 'desk' },
    ],
    'you',
  );
  const preview = previewMemoryRepair(w, 'sample-social', correction);
  assert.equal(preview.items.length, 3);
  assert.equal(preview.items.filter((i) => i.contextMatch).length, 1);
  const next = applyMemoryRepair(
    w,
    preview,
    preview.items.map((item) =>
      item.kind === 'note'
        ? { key: item.key, action: 'remove' }
        : item.contextMatch
          ? {
              key: item.key,
              action: 'rewrite',
              text: 'Choose a plan together on Saturday.',
            }
          : { key: item.key, action: 'keep' },
    ),
  );
  assert.equal(
    next.entity!.tasks[0].title,
    'Choose a plan together on Saturday.',
  );
  assert.equal(next.entity!.tasks[1].title, 'Buy coffee');
  assert.equal(next.entity!.notes.length, 0);
  assert.equal(next.entity!.receipts.at(-1)!.actor, 'you');
  assert.equal(next.entity!.receipts.at(-1)!.action, 'memory_repaired');
  assert.ok(validWorkspace(next));
});

await test('invalid or incomplete decisions cannot leave a partial memory or plan edit', () => {
  const w = repairSample();
  const preview = previewMemoryRepair(w, 'sample-social', correction);
  const before = JSON.stringify(w);
  for (const decisions of [
    [],
    [{ key: preview.items[0].key, action: 'rewrite' as const, text: ' ' }],
    [{ key: 'task:unknown', action: 'remove' as const }],
    [
      {
        key: preview.items[0].key,
        action: 'rewrite' as const,
        text: 'a'.repeat(241),
      },
    ],
  ])
    assert.throws(() => applyMemoryRepair(w, preview, decisions));
  assert.equal(JSON.stringify(w), before);
});

await test('stale previews reject concurrent plan changes, additions, pin edits, and a second correction', () => {
  const w = repairSample();
  const preview = previewMemoryRepair(w, 'sample-social', correction);
  const changed = structuredClone(w);
  changed.entity!.tasks[0].title = 'A new plan from another interaction';
  assert.throws(
    () => applyMemoryRepair(changed, preview, keep(preview)),
    /Preview.*again/,
  );
  const added = applyEntityActions(
    w,
    [{ type: 'note', text: 'New note', zone: 'desk' }],
    'you',
  );
  assert.throws(
    () => applyMemoryRepair(added, preview, keep(preview)),
    /Preview.*again/,
  );
  const pinned = structuredClone(w);
  pinned.memories[0].pinned = true;
  assert.throws(
    () => applyMemoryRepair(pinned, preview, keep(preview)),
    /Preview.*again/,
  );
  const next = applyMemoryRepair(w, preview, keep(preview));
  assert.throws(
    () => applyMemoryRepair(next, preview, keep(preview)),
    /no longer current/,
  );
});

await test('new context excludes pre-correction dialogue and receipts without deleting either from history', () => {
  let w = repairSample();
  const oldText = w.memories[0].text;
  w.messages.push({
    id: 'old-belief',
    role: 'assistant',
    text: oldText,
    mode: 'model',
    createdAt: new Date().toISOString(),
  });
  w = receipt(w, 'old_assumption', oldText, 'agent');
  const preview = previewMemoryRepair(w, 'sample-social', correction);
  const next = applyMemoryRepair(w, preview, keep(preview));
  assert.ok(next.messages.some((m) => m.text === oldText));
  assert.ok(next.entity!.receipts.some((r) => r.detail === oldText));
  assert.ok(!JSON.stringify(entityContext(next, 'parties')).includes(oldText));
  assert.ok(
    !entityDemo('What do you remember about me?', next).reply.includes(oldText),
  );
  assert.equal(currentMessages(next).length, 0);
  const started = beginTurn(next, 'What sounds good?', { provider: 'demo' });
  const completed = completeTurn(
    started.workspace,
    started.run.id,
    { reply: 'Let’s choose together.', actions: [] },
    new AbortController().signal,
  );
  assert.equal(currentMessages(completed).length, 2);
  assert.ok(validWorkspace(completed));
});

await test('correction invalidates in-flight replies and their entire action batch across all providers', () => {
  for (const provider of ['demo', 'ollama', 'deepseek'] as const) {
    const started = beginTurn(repairSample(), 'party plan', {
      provider,
      model: 'test-model',
    });
    const preview = previewMemoryRepair(
      started.workspace,
      'sample-social',
      correction,
    );
    const next = applyMemoryRepair(started.workspace, preview, keep(preview));
    const before = JSON.stringify(next);
    assert.throws(
      () =>
        completeTurn(
          next,
          started.run.id,
          {
            reply: 'An answer based on the old understanding',
            actions: [
              { type: 'move', zone: 'desk' },
              { type: 'task', title: 'A stale plan' },
            ],
          },
          new AbortController().signal,
        ),
      /Memory context changed/,
    );
    assert.equal(JSON.stringify(next), before);
    const failure = classifyFailure(new Error('Memory context changed.'));
    assert.equal(failure, 'context_changed');
    const stopped = stopTurn(next, started.run.id, 'failed', failure);
    assert.equal(stopped.runs!.at(-1)!.receiptIds.length, 0);
    assert.ok(validWorkspace(stopped));
  }
});

await test('runtime-created plans and notes retain context exposure after the short run log expires', () => {
  const started = beginTurn(repairSample(), 'party plan', {
    provider: 'ollama',
    model: 'test-model',
  });
  const next = completeTurn(
    started.workspace,
    started.run.id,
    {
      reply: 'Two suggestions',
      actions: [
        { type: 'task', title: 'Check the weekend' },
        { type: 'note', text: 'Weekend options', zone: 'desk' },
      ],
    },
    new AbortController().signal,
  );
  const plan = next.entity!.tasks.at(-1)!;
  assert.equal(plan.origin!.runId, started.run.id);
  assert.ok(plan.origin!.memoryIds.includes('sample-social'));
  next.runs = [];
  const preview = previewMemoryRepair(next, 'sample-social', correction);
  assert.equal(preview.items.filter((i) => i.contextMatch).length, 3);
  assert.ok(validWorkspace(canonicalWorkspace(next)));
});

await test('repeated corrections survive export; deleting an intermediate or latest version never resurrects retired wording', () => {
  const first = corrected();
  const revisedId = first.memories.find((m) => m.supersedes)!.id;
  const preview = previewMemoryRepair(
    first,
    revisedId,
    'I enjoy small gatherings when I have the energy.',
  );
  const next = applyMemoryRepair(first, preview, keep(preview));
  assert.equal(next.memoryVersion, 2);
  assert.ok(validWorkspace(next));
  assert.equal(
    activeMemories(next.memories).filter((m) => m.id !== 'sample-morning')
      .length,
    1,
  );
  const exported = canonicalWorkspace(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(exported, next);
  exported.memories = exported.memories.filter((m) => m.id !== revisedId);
  assert.ok(validWorkspace(exported));
  exported.memories = exported.memories.filter(
    (m) => m.supersededBy || m.id === 'sample-morning',
  );
  assert.ok(validWorkspace(exported));
  assert.deepEqual(
    activeMemories(exported.memories).map((m) => m.id),
    ['sample-morning'],
  );
});

await test('correction validation rejects cyclic links, invalid versions, and unsupported edits to calculation evidence', () => {
  const next = corrected();
  const old = next.memories.find((m) => m.id === 'sample-social')!;
  const revised = next.memories.find((m) => m.supersedes)!;
  old.supersedes = revised.id;
  revised.supersededBy = old.id;
  assert.equal(validWorkspace(next), false);
  const bad = corrected();
  bad.memoryVersion = -1;
  assert.equal(validWorkspace(bad), false);
  const w = repairSample();
  const evidence = evidenceMemory(w.experiments[0]);
  w.memories.push(evidence);
  assert.throws(
    () => previewMemoryRepair(w, evidence.id, 'A different result'),
    /no longer current/,
  );
  const full = repairSample();
  full.memories.push(
    ...Array.from({ length: 198 }, (_, i) => ({
      ...full.memories[1],
      id: `full-${i}`,
    })),
  );
  assert.throws(
    () => previewMemoryRepair(full, 'sample-social', correction),
    /Memory is full/,
  );
});

await test('export whitelists correction lineage and origin metadata without retaining arbitrary secret fields', () => {
  const w = corrected();
  Object.assign(w.memories[0], {
    secret: 'private-secret',
    oldText: 'private-secret',
  });
  Object.assign(w.entity!.tasks[0].origin!, { apiKey: 'private-secret' });
  const clean = canonicalWorkspace(w);
  assert.ok(validWorkspace(clean));
  assert.ok(!JSON.stringify(clean).includes('private-secret'));
  assert.equal(clean.memories[0].supersededBy, w.memories[0].supersededBy);
});

await test('local prompt construction and a mocked hosted handoff carry the same corrected context', async () => {
  const w = corrected();
  const request = 'parties this weekend';
  const local = JSON.parse(
    localRequest(w, request, 'test-model').messages[1].content,
  ).context;
  const originalFetch = globalThis.fetch;
  let hostedContext: unknown;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.surface, 'space');
    assert.ok(validWorkspace(body.workspace));
    // The hosted route canonicalizes the workspace and uses this shared context builder.
    hostedContext = entityContext(
      canonicalWorkspace(body.workspace),
      body.message,
    );
    return Response.json({ reply: 'Mock response only.', actions: [] });
  };
  try {
    await runAgent(
      {
        provider: 'deepseek',
        key: 'mock-unused-key',
        model: 'deepseek-v4-flash',
      },
      w,
      request,
      new AbortController().signal,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(hostedContext, local);
  assert.ok(JSON.stringify(local).includes(correction));
  assert.ok(!JSON.stringify(local).includes('I do not like parties.'));
});
