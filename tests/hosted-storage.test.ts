import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '../lib/field';
import { applyMemoryRepair, previewMemoryRepair } from '../lib/memory-repair';
import { eventData } from '../lib/event-stream';

const url = process.env.FIELD_TEST_URL;
const fixture = process.env.FIELD_TEST_PROVIDER;
type Saved = { workspace: Workspace; revision: number; scope: string };
type Visitor = Saved & { cookie: string };
type Event = { type: string; text?: string; code?: string; status?: string };
const headers = (v: Visitor) => ({
  Cookie: v.cookie,
  Origin: url!,
  'Content-Type': 'application/json',
});
async function visitor(): Promise<Visitor> {
  const r = await fetch(`${url}/api/workspace`);
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'Hosted tests require an isolated database in guest mode.');
  return { ...((await r.json()) as Saved), cookie };
}
async function read(v: Visitor) {
  const r = await fetch(`${url}/api/workspace`, { headers: headers(v) });
  assert.equal(r.status, 200);
  const saved = (await r.json()) as Saved;
  Object.assign(v, saved);
  return saved;
}
async function save(v: Visitor, workspace = v.workspace) {
  const r = await fetch(`${url}/api/workspace`, {
    method: 'PUT',
    headers: headers(v),
    body: JSON.stringify({ scope: v.scope, revision: v.revision, workspace }),
  });
  assert.equal(r.status, 200);
  await read(v);
}
function post(
  v: Visitor,
  message: string,
  id = randomUUID(),
  extra: Record<string, unknown> = {},
) {
  return fetch(`${url}/api/companion`, {
    method: 'POST',
    headers: headers(v),
    body: JSON.stringify({ id, message, revision: v.revision, ...extra }),
  });
}
async function collect(r: Response) {
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type')!, /text\/event-stream/);
  const events: Event[] = [];
  for await (const data of eventData(r.body!)) events.push(JSON.parse(data));
  return events;
}
async function hold(v: Visitor, label: string) {
  const id = randomUUID(),
    message = `HOLD ${label} ${id}`;
  const r = await post(v, message, id);
  assert.equal(r.status, 200);
  const events = eventData(r.body!);
  assert.equal(JSON.parse((await events.next()).value!).type, 'start');
  assert.equal(JSON.parse((await events.next()).value!).type, 'text');
  await read(v);
  return {
    id,
    message,
    finish: async () => {
      await fetch(`${fixture}/release?message=${encodeURIComponent(message)}`);
      const rest: Event[] = [];
      for await (const data of events) rest.push(JSON.parse(data));
      return rest;
    },
  };
}
async function calls() {
  return (await (await fetch(`${fixture}/calls`)).json()) as {
    message: string;
    context: {
      memories: { text: string }[];
      memoryVersion: number;
      recentMessages: unknown[];
    };
  }[];
}
async function access(v: Visitor) {
  return (await (
    await fetch(`${url}/api/companion`, { headers: headers(v) })
  ).json()) as { enabled: boolean; remaining: number };
}

await test(
  'site-managed conversations persist through the real HTTP and D1 boundary',
  { skip: !url || !fixture || process.env.FIELD_TEST_HOSTED !== '1' },
  async (t) => {
    await t.test(
      'missing credentials, foreign origins, forged context and stale revisions do not call the provider',
      async () => {
        const v = await visitor(),
          before = (await calls()).length;
        assert.equal(
          (
            await fetch(`${url}/api/companion`, {
              method: 'POST',
              headers: { Origin: url! },
              body: '{}',
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await fetch(`${url}/api/companion`, {
              method: 'POST',
              headers: { ...headers(v), Origin: 'https://unrelated.example' },
              body: '{}',
            })
          ).status,
          403,
        );
        for (const extra of [
          { workspace: v.workspace },
          { key: 'fake' },
          { model: 'fake' },
          { scope: 'workspace' },
        ])
          assert.equal(
            (await post(v, 'Hello', randomUUID(), extra)).status,
            400,
          );
        assert.equal(
          (await post(v, 'Hello', randomUUID(), { revision: v.revision + 1 }))
            .status,
          409,
        );
        assert.equal((await calls()).length, before);
      },
    );
    await t.test(
      'server reads saved memory and commits a reply, action, run and usage together; replay is idempotent',
      async () => {
        const a = await visitor(),
          b = await visitor();
        a.workspace.memories.push({
          id: 'coffee',
          text: 'I prefer coffee before writing.',
          source: 'user',
          createdAt: new Date().toISOString(),
          pinned: true,
        });
        await save(a);
        const id = randomUUID(),
          message = `Coffee before writing ${id}`,
          before = (await calls()).length;
        const events = await collect(await post(a, message, id));
        assert.equal(events.at(-1)!.type, 'done');
        await read(a);
        assert.equal(a.workspace.messages.at(-1)!.text, 'Mock response only.');
        assert.equal(
          a.workspace.entity!.tasks.at(-1)!.title,
          'Fixture plan only',
        );
        const run = a.workspace.runs!.at(-1)!;
        assert.equal(run.provider, 'site');
        assert.equal(run.status, 'completed');
        assert.equal(run.usage!.total, 50);
        assert.ok(run.memory!.matches.some((m) => m.id === 'coffee'));
        assert.equal(
          (await calls()).find((c) => c.message === message)!.context
            .memories[0].text,
          'I prefer coffee before writing.',
        );
        assert.ok(
          !(await read(b)).workspace.messages.some((m) => m.text === message),
        );
        const replay = await post(a, message, id);
        assert.equal(replay.status, 200);
        assert.equal(
          ((await replay.json()) as { status: string }).status,
          'completed',
        );
        assert.equal((await post(a, 'Different message', id)).status, 409);
        assert.equal((await calls()).length, before + 1);
      },
    );
    await t.test(
      'text arrives before actions; a visitor can have only one active response',
      async () => {
        const v = await visitor(),
          pending = await hold(v, 'single');
        assert.equal(v.workspace.entity!.tasks.length, 0);
        assert.ok(
          !v.workspace.messages.some((m) => m.text === 'Mock response only.'),
        );
        assert.equal(v.workspace.runs!.at(-1)!.status, 'running');
        const rejected = await post(v, 'Concurrent request');
        assert.equal(rejected.status, 429);
        assert.equal(
          ((await rejected.json()) as { code: string }).code,
          'busy',
        );
        assert.equal((await pending.finish()).at(-1)!.type, 'done');
        assert.equal((await read(v)).workspace.entity!.tasks.length, 1);
      },
    );
    await t.test('global concurrency is enforced across visitors', async () => {
      const a = await visitor(),
        b = await visitor(),
        c = await visitor();
      const x = await hold(a, 'global-a'),
        y = await hold(b, 'global-b');
      const rejected = await post(c, 'Global concurrent request');
      assert.equal(rejected.status, 429);
      assert.equal(((await rejected.json()) as { code: string }).code, 'busy');
      await Promise.all([x.finish(), y.finish()]);
    });
    await t.test(
      'stopping is durable and a stop arriving before start prevents a late provider call',
      async () => {
        const v = await visitor(),
          pending = await hold(v, 'cancel');
        const stopped = await fetch(`${url}/api/companion?id=${pending.id}`, {
          method: 'DELETE',
          headers: headers(v),
        });
        assert.equal(stopped.status, 200);
        assert.equal(
          ((await stopped.json()) as { status: string }).status,
          'cancelled',
        );
        assert.equal((await pending.finish()).at(-1)!.code, 'cancelled');
        await read(v);
        assert.equal(v.workspace.entity!.tasks.length, 0);
        assert.equal(v.workspace.runs!.at(-1)!.status, 'cancelled');
        const before = (await calls()).length,
          id = randomUUID();
        assert.equal(
          (
            await fetch(`${url}/api/companion?id=${id}`, {
              method: 'DELETE',
              headers: headers(v),
            })
          ).status,
          200,
        );
        const late = await post(v, 'Late request', id);
        assert.equal(
          ((await late.json()) as { status: string }).status,
          'cancelled',
        );
        assert.equal((await calls()).length, before);
      },
    );
    await t.test(
      'a correction in another tab invalidates in-flight actions and the next turn uses current memory',
      async () => {
        const v = await visitor();
        v.workspace.memories.push({
          id: 'old',
          text: 'I prefer coffee.',
          source: 'user',
          createdAt: new Date().toISOString(),
          pinned: true,
        });
        await save(v);
        const pending = await hold(v, 'coffee correction');
        const preview = previewMemoryRepair(
          v.workspace,
          'old',
          'I prefer tea now.',
        );
        await save(v, applyMemoryRepair(v.workspace, preview, []));
        assert.equal((await pending.finish()).at(-1)!.code, 'context_changed');
        await read(v);
        assert.equal(v.workspace.entity!.tasks.length, 0);
        assert.equal(v.workspace.runs!.at(-1)!.failure, 'context_changed');
        const message = `Tea now ${randomUUID()}`;
        assert.equal(
          (await collect(await post(v, message))).at(-1)!.type,
          'done',
        );
        const context = (await calls()).find(
          (c) => c.message === message,
        )!.context;
        assert.equal(context.memoryVersion, 1);
        assert.deepEqual(
          context.memories.map((m) => m.text),
          ['I prefer tea now.'],
        );
        assert.ok(
          !JSON.stringify(context.recentMessages).includes(pending.message),
        );
      },
    );
    await t.test(
      'permissions are checked at commit and malformed or failed responses cannot save actions',
      async () => {
        for (const message of ['FAIL test', 'INVALID test', 'TRUNCATED test']) {
          const v = await visitor(),
            events = await collect(await post(v, message));
          assert.equal(events.at(-1)!.type, 'error');
          assert.ok(
            !JSON.stringify(events).includes('Private fixture upstream detail'),
          );
          await read(v);
          assert.equal(v.workspace.entity!.tasks.length, 0);
          assert.equal(v.workspace.runs!.at(-1)!.status, 'failed');
          assert.equal(
            (await access(v)).remaining,
            2,
            'Failed attempts keep their reservation.',
          );
        }
        const v = await visitor(),
          pending = await hold(v, 'permission');
        v.workspace.entity!.permissions.tasks = false;
        await save(v);
        assert.equal((await pending.finish()).at(-1)!.code, 'permission');
        assert.equal((await read(v)).workspace.entity!.tasks.length, 0);
      },
    );
    await t.test(
      'daily visitor allowance survives clearing conversation state',
      async () => {
        const v = await visitor(),
          clean = structuredClone(v.workspace);
        assert.equal((await access(v)).remaining, 3);
        for (let i = 0; i < 3; i++) {
          assert.equal(
            (await collect(await post(v, `Allowance ${i}`))).at(-1)!.type,
            'done',
          );
          await read(v);
        }
        assert.equal((await access(v)).remaining, 0);
        await save(v, clean);
        const before = (await calls()).length,
          rejected = await post(v, 'Try resetting allowance');
        assert.equal(rejected.status, 429);
        assert.equal(
          ((await rejected.json()) as { code: string }).code,
          'quota',
        );
        assert.equal((await calls()).length, before);
      },
    );
    await t.test(
      'expired requests recover when the workspace opens, without losing the reservation',
      { skip: !process.env.FIELD_TEST_D1 },
      async () => {
        const path = process.env.FIELD_TEST_D1!;
        assert.ok(
          path.includes('/field-hosted-verify-') && path.endsWith('.sqlite'),
          'Only an isolated fixture database may be modified.',
        );
        const v = await visitor(),
          pending = await hold(v, 'expired');
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(path);
        try {
          assert.equal(
            db
              .prepare(
                'UPDATE hosted_turns SET expires_at = 0 WHERE id = ? AND workspace_id = ?',
              )
              .run(pending.id, v.scope).changes,
            1,
          );
        } finally {
          db.close();
        }
        await read(v);
        assert.equal(v.workspace.runs!.at(-1)!.status, 'failed');
        assert.equal(v.workspace.runs!.at(-1)!.failure, 'timeout');
        assert.equal(v.workspace.entity!.tasks.length, 0);
        assert.equal((await access(v)).remaining, 2);
        assert.equal((await pending.finish()).at(-1)!.type, 'error');
        assert.equal(
          (await collect(await post(v, 'After recovery'))).at(-1)!.type,
          'done',
        );
      },
    );
  },
);

await test(
  'site budget or global turn cap blocks all new visitors before calling the provider',
  { skip: !url || !fixture || process.env.FIELD_TEST_QUOTA !== '1' },
  async () => {
    const before = (await calls()).length;
    const visitors = await Promise.all([visitor(), visitor(), visitor()]);
    const responses = await Promise.all(
      visitors.map((v) => post(v, 'Global allowance check')),
    );
    for (const r of responses) {
      assert.equal(r.status, 429);
      assert.equal(((await r.json()) as { code: string }).code, 'quota');
    }
    assert.equal((await calls()).length, before);
  },
);
