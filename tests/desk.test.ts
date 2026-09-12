import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DeskStore } from '../db/desk-store';
import {
  newDesk,
  startDeskTask,
  advanceDesk,
  rearrangeDesk,
  stopDeskTask,
  pairDesk,
  claimDeskTask,
  reportDeskTask,
  reviewDeskTask,
  publicDesk,
  switchToVirtualDesk,
  inTray,
} from '../lib/desk';
import { deskContext } from '../lib/desk-context';
import {
  executeDeskTask,
  type BridgeIO,
  type OperatorState,
} from '../lib/desk-controller';
import { ensureEntity } from '../lib/entity';
import { initialWorkspace } from '../lib/field';

const now = 1800000000000;
function physical() {
  const s = pairDesk(newDesk(), 'bridge-secret-hash', now);
  claimDeskTask(s, 'idle', now);
  const id = randomUUID();
  startDeskTask(s, id, 'Zuri, put the green cup on the tray.', now);
  claimDeskTask(s, 'private-execution-lease', now + 1);
  return { s, id, lease: 'private-execution-lease' };
}
await test('virtual execution re-observes a moved object, verifies geometry, and survives serialization', () => {
  let s = newDesk();
  const id = randomUUID();
  startDeskTask(s, id, 'Put the green cup on the tray.', now);
  advanceDesk(s, now + 1200);
  advanceDesk(s, now + 2400);
  rearrangeDesk(s, now + 2500);
  advanceDesk(s, now + 3700);
  assert.equal(s.tasks[0].stage, 1);
  assert.match(s.tasks[0].events.at(-1)!.text, /Re-observing/);
  s = JSON.parse(JSON.stringify(s));
  for (let i = 1; i <= 5; i++) advanceDesk(s, now + 3700 + i * 1200);
  assert.equal(s.tasks[0].status, 'succeeded');
  assert.ok(inTray(s.world.objects[0]));
  assert.equal(s.tasks[0].verdict, 'geometry');
  assert.equal(s.tasks[0].events[0].world!.objects[0].x, -0.6);
});
await test('moving the placed cup before verification fails; stopped tasks never auto-complete', () => {
  const s = newDesk();
  startDeskTask(s, randomUUID(), 'Put the green cup on the tray.', now);
  for (let i = 1; i <= 5; i++) advanceDesk(s, now + i * 1200);
  rearrangeDesk(s, now + 6100);
  advanceDesk(s, now + 7400);
  assert.equal(s.tasks[0].status, 'failed');
  const id = randomUUID();
  startDeskTask(s, id, 'Put the coral cup on the tray.', now + 7500);
  stopDeskTask(s, id, now + 7600);
  advanceDesk(s, now + 100000);
  assert.equal(s.tasks[1].status, 'stopped');
});
await test('request ids are idempotent and never change their command', () => {
  const s = newDesk(),
    id = randomUUID();
  startDeskTask(s, id, 'Put the green cup on the tray.', now);
  startDeskTask(s, id, 'Zuri, put the green cup on the tray.', now + 20);
  assert.equal(s.tasks.length, 1);
  assert.throws(
    () => startDeskTask(s, id, 'Put the coral cup on the tray.', now),
    /another task/,
  );
  assert.throws(
    () => startDeskTask(s, randomUUID(), 'Delete files', now),
    /Try/,
  );
});
await test('a device cannot certify success and stale evidence cannot pass review', () => {
  const { s, id, lease } = physical();
  assert.throws(
    () =>
      reportDeskTask(
        s,
        { id, lease, status: 'succeeded', text: 'Done' },
        now + 10,
      ),
    /Unsupported/,
  );
  assert.throws(
    () =>
      reportDeskTask(
        s,
        { id, lease, status: 'awaiting_verification', text: 'Done' },
        now + 10,
      ),
    /Camera evidence/,
  );
  const input = {
    id,
    lease,
    status: 'awaiting_verification',
    text: 'Review placement.',
    observation: {
      sequence: 1,
      capturedAt: now,
      imageUrl: 'https://camera.example/frame.jpg',
    },
  };
  reportDeskTask(s, input, now + 1000);
  assert.throws(
    () => reportDeskTask(s, input, now + 1100),
    /already been processed/,
  );
  assert.throws(() => reviewDeskTask(s, id, true, now + 31000), /fresh camera/);
  reviewDeskTask(s, id, true, now + 2000);
  assert.equal(s.tasks[0].status, 'succeeded');
  assert.equal(s.tasks[0].verdict, 'operator');
});
await test('uncertain physical dispatch expires without replay and pairing rotation is fenced', () => {
  const { s, id, lease } = physical();
  advanceDesk(s, now + 22000);
  assert.equal(s.tasks[0].status, 'needs_attention');
  claimDeskTask(s, 'new-lease', now + 23000);
  assert.equal(s.tasks[0].lease, lease);
  assert.throws(
    () =>
      reportDeskTask(
        s,
        { id, lease, status: 'running', text: 'Resuming' },
        now + 23000,
      ),
    /closed/,
  );
  assert.throws(() => switchToVirtualDesk(s), /Resolve/);
  assert.throws(() => pairDesk(s, 'another-key', now), /Resolve/);
  assert.ok(!JSON.stringify(publicDesk(s)).includes(lease));
  assert.ok(!JSON.stringify(deskContext(s)).includes('bridge-secret'));
});
await test('SQLite concurrent requests dispatch once and a rejected transition leaves no partial state', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    readFileSync(new URL('../drizzle/0000_field.sql', import.meta.url), 'utf8'),
  );
  const prepare = (query: string, args: (string | number | null)[] = []) => ({
    bind: (...values: (string | number | null)[]) => prepare(query, values),
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({
      meta: { changes: Number(sql.prepare(query).run(...args).changes) },
    }),
  });
  const store = new DeskStore({ prepare } as unknown as D1Database);
  try {
    await store.change('a', (s) => {
      pairDesk(s, 'secret', now);
      claimDeskTask(s, 'idle', now);
      return s;
    });
    const starts = await Promise.allSettled(
      [randomUUID(), randomUUID()].map((id) =>
        store.change('a', (s) =>
          startDeskTask(s, id, 'Put the green cup on the tray.', now),
        ),
      ),
    );
    assert.equal(starts.filter((r) => r.status === 'fulfilled').length, 1);
    await Promise.all(
      ['lease-one', 'lease-two'].map((lease) =>
        store.change('a', (s) => claimDeskTask(s, lease, now + 1)),
      ),
    );
    const saved = (await store.read('a')).state;
    assert.equal(saved.tasks.length, 1);
    assert.equal(
      saved.tasks[0].events.filter((e) => e.text.includes('device accepted'))
        .length,
      1,
    );
    assert.equal((await store.read('b')).state.tasks.length, 0);
    await assert.rejects(
      store.change('a', (s) => {
        s.world.revision = 999;
        throw new Error('Reject');
      }),
    );
    assert.deepEqual((await store.read('a')).state, saved);
  } finally {
    sql.close();
  }
});
await test('the current companion preserves identity, memories and custom names', () => {
  const w = ensureEntity(initialWorkspace());
  w.profile.name = 'Zuri';
  const old = structuredClone(w);
  assert.equal(ensureEntity(w), w);
  assert.deepEqual(w, old);
  assert.equal(w.profile.name, 'Zuri');
  w.profile.name = 'My companion';
  assert.equal(ensureEntity(w), w);
});

function controllerFixture(outcome = 'saved', stop = false) {
  let clock = now,
    active: string | null = 'running',
    checkpoint = false,
    steps = 0;
  const calls: string[] = [];
  const s: OperatorState = {
    mode: 'paused',
    busy: false,
    pending_once: 0,
    cycle: 0,
    dry_run: false,
    events: [],
  };
  const io: BridgeIO = {
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    checkpoint: async (task) => {
      checkpoint = !!task;
      calls.push(task ? 'journal' : 'clear');
    },
    operator: async (path) => {
      calls.push(path);
      if (path === '/api/step') {
        assert.ok(checkpoint);
        steps++;
        s.cycle++;
        s.events = [{ cycle: s.cycle, outcome }];
      }
      return { ...s };
    },
    capture: async () => ({
      sequence: s.cycle + 1,
      capturedAt: clock,
      imageUrl: 'https://camera.example/frame.jpg',
    }),
    field: async (body) => {
      if (body.status === 'awaiting_verification') active = null;
      if (body.status === 'succeeded')
        assert.fail('A device must never certify placement');
      if (stop && body.action === 'heartbeat') active = 'stopping';
      return {
        task: null,
        active: active ? { id: 'task', status: active } : null,
      };
    },
  };
  return { io, calls, steps: () => steps, journal: () => checkpoint };
}
await test('controller journals before dispatch and routes completed motion to operator review', async () => {
  const f = controllerFixture();
  await executeDeskTask(f.io, {
    id: 'task',
    lease: 'lease',
    instruction: 'Put the green cup on the tray.',
  });
  assert.equal(f.calls[0], 'journal');
  assert.equal(f.steps(), 1);
  assert.equal(f.journal(), false);
});
await test('controller pauses on requested stop without taking another step', async () => {
  const f = controllerFixture('executed', true);
  await executeDeskTask(f.io, {
    id: 'task',
    lease: 'lease',
    instruction: 'Put the green cup on the tray.',
  });
  assert.equal(f.steps(), 0);
  assert.ok(f.calls.includes('/api/pause'));
});
await test('controller refuses rejected motion and retains its journal after uncertain execution', async () => {
  const f = controllerFixture('stale_observation');
  await assert.rejects(
    executeDeskTask(f.io, {
      id: 'task',
      lease: 'lease',
      instruction: 'Put the green cup on the tray.',
    }),
    /rejected/,
  );
  assert.equal(f.steps(), 1);
  assert.equal(f.journal(), true);
  assert.ok(f.calls.includes('/api/pause'));
});
