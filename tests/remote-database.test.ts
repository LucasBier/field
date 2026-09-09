import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteDatabase } from '../db/remote';
import worker from '../deploy/database-worker';

const token = 'a'.repeat(64);
const configuration = () => ({ url: 'https://database.example/batch', token });
await test('remote storage sends a transaction once, preserves parameters and returns change counts', async () => {
  let calls = 0;
  const db = new RemoteDatabase(configuration, async (url, options) => {
    calls++;
    assert.ok(url instanceof URL);
    assert.equal(url.href, configuration().url);
    assert.equal(
      new Headers(options?.headers).get('authorization'),
      `Bearer ${token}`,
    );
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    assert.equal(typeof options?.body, 'string');
    assert.deepEqual(JSON.parse(options!.body as string), {
      statements: [
        {
          sql: 'UPDATE workspaces SET revision = revision + 1 WHERE id = ?',
          args: ['guest:one'],
        },
        {
          sql: 'SELECT revision FROM workspaces WHERE id = ?',
          args: ['guest:one'],
        },
      ],
    });
    return Response.json({
      results: [
        { success: true, results: [], meta: { changes: 1 } },
        { success: true, results: [{ revision: 2 }], meta: { changes: 0 } },
      ],
    });
  });
  const result = await db.batch([
    db
      .prepare('UPDATE workspaces SET revision = revision + 1 WHERE id = ?')
      .bind('guest:one'),
    db
      .prepare('SELECT revision FROM workspaces WHERE id = ?')
      .bind('guest:one'),
  ]);
  assert.equal(calls, 1);
  assert.equal(result[0].meta.changes, 1);
  assert.equal(result[1].results[0].revision, 2);
});

await test('storage fails closed without configuration and never retries an uncertain write', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    throw new Error('disconnected');
  };
  for (const config of [
    {},
    { url: 'http://database.example/batch', token },
    { url: 'https://u:p@database.example/batch', token },
  ]) {
    const db = new RemoteDatabase(() => config, transport);
    await assert.rejects(db.prepare('SELECT 1').all());
  }
  assert.equal(calls, 0);
  const db = new RemoteDatabase(configuration, transport);
  await assert.rejects(db.prepare('UPDATE workspaces SET revision = 1').run());
  assert.equal(calls, 1);
});

await test('storage rejects partial or malformed batches instead of acknowledging a commit', async () => {
  for (const results of [
    [],
    [{ success: false, results: [], meta: { changes: 1 } }],
    [{ success: true, results: [] }],
  ]) {
    const db = new RemoteDatabase(configuration, async () =>
      Response.json({ results }),
    );
    await assert.rejects(db.prepare('SELECT 1').all());
  }
});

await test('database endpoint requires a server credential, validates bounds and batches atomically', async () => {
  let calls = 0;
  const fake = {
    prepare(sql: string) {
      return { bind: (...args: unknown[]) => ({ sql, args }) };
    },
    async batch(statements: unknown[]) {
      calls++;
      assert.deepEqual(statements, [{ sql: 'SELECT 1', args: [] }]);
      return [{ success: true, results: [{ value: 1 }], meta: { changes: 0 } }];
    },
  } as unknown as D1Database;
  const request = (body: unknown, auth = token, method = 'POST') =>
    new Request(configuration().url, {
      method,
      headers: { Authorization: `Bearer ${auth}` },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
  const env = { DB: fake, FIELD_DATABASE_TOKEN: token };
  const body = { statements: [{ sql: 'SELECT 1', args: [] }] };
  assert.equal((await worker.fetch(request(body), { DB: fake })).status, 401);
  assert.equal(
    (await worker.fetch(request(body, 'b'.repeat(64)), env)).status,
    401,
  );
  assert.equal(
    (await worker.fetch(request(body, token, 'GET'), env)).status,
    405,
  );
  for (const invalid of [
    { statements: [] },
    { statements: Array(11).fill(body.statements[0]) },
    { statements: [{ sql: 'SELECT 1', args: [{}] }] },
  ])
    assert.equal((await worker.fetch(request(invalid), env)).status, 400);
  assert.equal(calls, 0);
  const response = await worker.fetch(request(body), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls, 1);
});
