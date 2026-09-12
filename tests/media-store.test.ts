import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { DatabaseMedia } from '../db/media-store';

const key = `guest:${'a'.repeat(64)}/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;
const options = {
  httpMetadata: { contentType: 'image/jpeg' },
  customMetadata: { capturedAt: String(Date.now()) },
};
function fixture(failAt = -1) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('drizzle/0000_field.sql', 'utf8'));
  let writes = 0;
  const database = {
    prepare: (query: string) => ({
      bind: (...values: (string | number | null)[]) => ({
        run: async () => {
          if (++writes === failAt) throw new Error('Connection lost');
          return sql.prepare(query).run(...values);
        },
        first: async <T>() =>
          (sql.prepare(query).get(...values) ?? null) as T | null,
      }),
    }),
  };
  return { sql, store: new DatabaseMedia(database) };
}

await test('evidence round-trips across chunks, remains immutable, and stays inside its workspace', async () => {
  const { sql, store } = fixture();
  try {
    const bytes = new Uint8Array(300_000).map((_, i) => i % 251);
    await store.put(key, bytes, options);
    const saved = await store.get(key);
    assert.ok(saved);
    assert.equal(saved.size, bytes.length);
    assert.equal(
      saved.customMetadata.capturedAt,
      options.customMetadata.capturedAt,
    );
    assert.deepEqual(
      new Uint8Array(await new Response(saved.body).arrayBuffer()),
      bytes,
    );
    assert.equal(
      await store.get(key.replace('a'.repeat(64), 'b'.repeat(64))),
      null,
    );
    await assert.rejects(store.put(key, new Uint8Array([1]), options));
    assert.equal((await store.head(key))?.size, bytes.length);
    await assert.rejects(store.get('../../private'));
  } finally {
    sql.close();
  }
});

await test('an interrupted upload never becomes visible and cannot be overwritten on retry', async () => {
  const { sql, store } = fixture(3);
  try {
    await assert.rejects(
      store.put(key, new Uint8Array(300_000), options),
      /Connection lost/,
    );
    assert.equal(await store.head(key), null);
    assert.equal(await store.get(key), null);
    await assert.rejects(store.put(key, new Uint8Array([1]), options));
  } finally {
    sql.close();
  }
});
