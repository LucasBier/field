import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  XClient,
  XError,
  X_SCOPES,
  digest,
  seal,
  unseal,
  equalSecret,
  xConfig,
  type XConfig,
} from '../lib/x-auth';
import { XConnection } from '../db/x-connection';
const config: XConfig = {
  clientId: 'example-client',
  clientSecret: 'example-secret',
  ownerKey: 'a'.repeat(64),
  encryptionKey: 'b'.repeat(64),
  userId: '12345',
  origin: 'https://field.example',
};
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    readFileSync(
      new URL('../drizzle/0002_x_connection.sql', import.meta.url),
      'utf8',
    ),
  );
  const prepare = (query: string, args: (string | number | null)[] = []) => ({
    bind: (...values: (string | number | null)[]) => prepare(query, values),
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({
      meta: { changes: Number(sql.prepare(query).run(...args).changes) },
    }),
  });
  const db = {
    prepare,
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      sql.exec('BEGIN');
      try {
        const values = [];
        for (const s of statements) values.push(await s.run());
        sql.exec('COMMIT');
        return values;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sql, db };
}
function fixture(
  options: { id?: string; scope?: string; refreshFailure?: boolean } = {},
) {
  const { sql, db } = database();
  const calls: { url: string; body: string }[] = [];
  const transport: typeof fetch = async (url, init) => {
    assert.ok(typeof url === 'string');
    const requestBody = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, body: requestBody });
    assert.equal(init?.redirect, 'error');
    if (url.endsWith('/oauth2/token')) {
      const body = new URLSearchParams(requestBody);
      if (body.get('grant_type') === 'refresh_token' && options.refreshFailure)
        throw new Error('network disconnected');
      assert.match(new Headers(init?.headers).get('authorization')!, /^Basic /);
      return Response.json({
        token_type: 'bearer',
        access_token: 'private-access',
        refresh_token: 'private-refresh',
        expires_in: 7200,
        scope: options.scope ?? X_SCOPES.join(' '),
      });
    }
    return Response.json({
      data: { id: options.id ?? '12345', username: 'NiaExample', name: 'Nia' },
    });
  };
  return {
    sql,
    db,
    calls,
    service: new XConnection(db, config, new XClient(config, transport)),
  };
}
async function connect(f: ReturnType<typeof fixture>) {
  const begin = await f.service.begin();
  const state = new URL(begin.url).searchParams.get('state')!;
  await f.service.callback(state, begin.browser, 'authorization-code');
  return { begin, state };
}
await test('configuration fails closed; credentials are compared by digest', async () => {
  assert.throws(() => xConfig({}), XError);
  assert.equal(await equalSecret('one', 'two'), false);
  assert.equal(await equalSecret('one', 'one'), true);
});
await test('credentials are encrypted with authenticated purpose and random IV', async () => {
  const a = await seal(config, 'tokens:12345', { secret: 'private-access' }),
    b = await seal(config, 'tokens:12345', { secret: 'private-access' });
  assert.notEqual(a, b);
  assert.ok(!a.includes('private-access'));
  assert.deepEqual(await unseal(config, 'tokens:12345', a), {
    secret: 'private-access',
  });
  await assert.rejects(unseal(config, 'pkce', a));
  await assert.rejects(
    unseal({ ...config, encryptionKey: 'c'.repeat(64) }, 'tokens:12345', a),
  );
});
await test('PKCE is browser bound, single use, encrypted at rest, and restricted to the expected account', async () => {
  const f = fixture();
  const begin = await f.service.begin();
  const url = new URL(begin.url),
    state = url.searchParams.get('state')!;
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    config.origin + '/api/social/x/callback',
  );
  const stored = f.sql.prepare('SELECT * FROM x_oauth_states').get()!;
  assert.equal(stored.id, await digest(state));
  assert.notEqual(stored.browser_hash, begin.browser);
  const verifier = await unseal<string>(
    config,
    'pkce',
    stored.verifier as string,
  );
  assert.equal(url.searchParams.get('code_challenge'), await digest(verifier));
  await assert.rejects(
    f.service.callback(state, 'x'.repeat(43), 'code'),
    /authorization_expired/,
  );
  assert.equal(f.calls.length, 0);
  await f.service.callback(state, begin.browser, 'code');
  const row = f.sql.prepare('SELECT * FROM x_connections').get()!;
  assert.ok(!(row.tokens as string).includes('private-access'));
  const status = await f.service.status();
  assert.equal(status.connected, true);
  assert.equal(status.automaticPosting, false);
  assert.ok(!JSON.stringify(status).includes('private-access'));
  await assert.rejects(
    f.service.callback(state, begin.browser, 'code'),
    /authorization_expired/,
  );
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every((c) => !c.url.endsWith('/tweets')));
});
await test('expired authorization, wrong account, and missing write scopes never store a connection', async () => {
  const expired = fixture(),
    b = await expired.service.begin();
  expired.sql.exec('UPDATE x_oauth_states SET expires_at=0');
  await assert.rejects(
    expired.service.callback(
      new URL(b.url).searchParams.get('state')!,
      b.browser,
      'code',
    ),
    /authorization_expired/,
  );
  assert.equal(expired.calls.length, 0);
  for (const options of [{ id: '99999' }, { scope: 'tweet.read users.read' }]) {
    const f = fixture(options);
    await assert.rejects(connect(f));
    assert.equal(
      f.sql.prepare('SELECT COUNT(*) AS n FROM x_connections').get()!.n,
      0,
    );
  }
});
await test('refresh rotates once under concurrent access; verification only reads the account', async () => {
  const f = fixture();
  await connect(f);
  const old = await seal(config, 'tokens:12345', {
    access_token: 'old',
    refresh_token: 'old-refresh',
    expiresAt: 0,
    scope: X_SCOPES.join(' '),
  });
  f.sql.prepare('UPDATE x_connections SET tokens=?,expires_at=0').run(old);
  const outcomes = await Promise.allSettled([
    f.service.accessToken(),
    f.service.accessToken(),
  ]);
  assert.equal(outcomes.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal(
    f.calls.filter((c) => c.body.includes('grant_type=refresh_token')).length,
    1,
  );
  assert.equal(
    f.sql.prepare('SELECT revision FROM x_connections').get()!.revision,
    2,
  );
  assert.equal((await f.service.verify()).verified, true);
  await f.service.disconnect();
  assert.equal((await f.service.status()).connected, false);
});
await test('an uncertain token rotation cannot be blindly retried', async () => {
  const f = fixture({ refreshFailure: true });
  await connect(f);
  f.sql
    .prepare('UPDATE x_connections SET tokens=?,expires_at=0')
    .run(
      await seal(config, 'tokens:12345', {
        access_token: 'old',
        refresh_token: 'old-refresh',
        expiresAt: 0,
        scope: X_SCOPES.join(' '),
      }),
    );
  await assert.rejects(f.service.accessToken(), /authorization_unconfirmed/);
  f.sql.exec('UPDATE x_connections SET lease_until=1');
  await assert.rejects(f.service.accessToken(), /reconnect_required/);
  assert.equal(
    f.calls.filter((c) => c.body.includes('grant_type=refresh_token')).length,
    1,
  );
});
