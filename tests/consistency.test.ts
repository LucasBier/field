import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../lib/field';
import { ensureEntity } from '../lib/entity';
import { beginTurn, completeTurn, stopTurn } from '../lib/runtime';
import { applyMemoryRepair, previewMemoryRepair } from '../lib/memory-repair';
import { activeMemories, retrieveMemories } from '../lib/memory';
import { canonicalWorkspace, validWorkspace } from '../lib/validation';

type Event = 'complete' | 'correct' | 'revoke' | 'cancel';
function permutations<T>(items: T[]): T[][] {
  if (!items.length) return [[]];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, i) => i !== index)).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

await test('all 24 completion/correction/revocation/cancellation orders preserve the commit boundary', async (t) => {
  const orders = permutations<Event>([
    'complete',
    'correct',
    'revoke',
    'cancel',
  ]);
  assert.equal(orders.length, 24);
  for (const order of orders) {
    await t.test(order.join(' → '), () => {
      const original = ensureEntity(initialWorkspace());
      original.memories = [
        {
          id: 'old-preference',
          text: 'Coffee is my morning drink.',
          source: 'user',
          pinned: true,
          createdAt: new Date().toISOString(),
        },
      ];
      const started = beginTurn(original, 'Plan a coffee morning', {
        provider: 'ollama',
        model: 'test-model',
      });
      let w = started.workspace;
      let accepted = false;
      const signal = new AbortController().signal;
      for (const event of order) {
        const before = JSON.stringify(w);
        if (event === 'correct') {
          const preview = previewMemoryRepair(
            w,
            'old-preference',
            'Tea is my morning drink now.',
          );
          w = applyMemoryRepair(
            w,
            preview,
            preview.items.map((item) => ({ key: item.key, action: 'keep' })),
          );
        } else if (event === 'revoke') {
          w = structuredClone(w);
          w.entity!.permissions.tasks = false;
        } else if (event === 'cancel') {
          if (
            w.runs!.find((r) => r.id === started.run.id)!.status === 'running'
          )
            w = stopTurn(w, started.run.id, 'cancelled');
        } else {
          const result = {
            reply: 'A proposed morning plan.',
            actions: [
              { type: 'move' as const, zone: 'desk' as const },
              { type: 'task' as const, title: 'Make morning coffee' },
            ],
          };
          if (order[0] === 'complete') {
            w = completeTurn(w, started.run.id, result, signal);
            accepted = true;
          } else {
            assert.throws(() =>
              completeTurn(w, started.run.id, result, signal),
            );
            assert.equal(
              JSON.stringify(w),
              before,
              'A rejected batch must not even apply its first move action.',
            );
          }
        }
        assert.ok(validWorkspace(w), `Invalid state after ${event}`);
      }
      assert.equal(accepted, order[0] === 'complete');
      assert.equal(w.entity!.tasks.length, accepted ? 1 : 0);
      assert.equal(w.entity!.zone, accepted ? 'desk' : 'center');
      assert.equal(
        w.messages.filter((m) => m.id !== 'welcome' && m.role === 'assistant')
          .length,
        accepted ? 1 : 0,
      );
      assert.equal(w.memoryVersion, 1);
      assert.deepEqual(
        activeMemories(w.memories).map((m) => m.text),
        ['Tea is my morning drink now.'],
      );
      for (const query of ['coffee', 'tea', '', 'an unrelated thought'])
        assert.ok(
          !retrieveMemories(w.memories, query).memories.some(
            (m) => m.id === 'old-preference',
          ),
        );
      assert.deepEqual(canonicalWorkspace(w), w);
      assert.equal(w.entity!.id, original.entity!.id);
    });
  }
});
