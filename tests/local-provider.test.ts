import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hostedConfig,
  reserveMicros,
  usageMicros,
  HostedError,
} from '../lib/hosted-config';
import { hostedMessages, hostedResponse } from '../lib/hosted-provider';
import {
  localEvents,
  localModelReady,
  LOCAL_RESPONSE_SCHEMA,
} from '../lib/local-provider';
import { initialWorkspace } from '../lib/field';

const env = {
  FIELD_AI_ENABLED: 'true',
  FIELD_AI_PROVIDER: 'ollama',
  FIELD_AI_MODEL: 'qwen3.5:9b',
};
const config = hostedConfig(env, true)!;
function stream(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i++) c.enqueue(bytes.slice(i, i + 1));
      c.close();
    },
  });
}
function output(
  reply = '{"reply":"Hello, Zuri.","actions":[]}',
  reason = 'stop',
) {
  return [
    {
      model: config.model,
      message: { content: reply.slice(0, 15) },
      done: false,
    },
    {
      model: config.model,
      message: { content: reply.slice(15) },
      done: true,
      done_reason: reason,
      prompt_eval_count: 50,
      eval_count: 20,
    },
  ]
    .map((c) => JSON.stringify(c) + '\n')
    .join('');
}

await test('local service needs no credential or dollar budget, is development-only and cannot select cloud models', () => {
  assert.equal(config.provider, 'ollama');
  assert.equal(config.key, '');
  assert.equal(config.endpoint, 'http://127.0.0.1:11434/api/chat');
  assert.equal(config.concurrency, 1);
  assert.equal(config.timeoutMs, 120000);
  assert.ok(config.leaseMs > config.timeoutMs);
  assert.equal(hostedConfig(env, false), null);
  for (const model of [
    'qwen3.5:cloud',
    'model-cloud',
    'http://remote.example/model',
    '../model',
    '',
  ])
    assert.equal(
      hostedConfig(
        { ...env, FIELD_AI_MODEL: model === '' ? ' ' : model },
        true,
      ),
      null,
    );
  assert.equal(
    hostedConfig({ ...env, FIELD_AI_PROVIDER: 'other' }, true),
    null,
  );
  assert.equal(hostedConfig({ ...env, FIELD_AI_CONCURRENCY: '2' }, true), null);
  assert.equal(
    hostedConfig(
      { ...env, FIELD_AI_TEST_ENDPOINT: 'https://example.com' },
      true,
    )!.endpoint,
    config.endpoint,
  );
});
await test('local inference records zero API spend and refuses context that could be truncated', () => {
  assert.equal(
    reserveMicros(hostedMessages(initialWorkspace(), 'Hello'), config),
    0,
  );
  assert.equal(usageMicros(1000, 100, config), 0);
  assert.throws(
    () => reserveMicros('x'.repeat(16000), config),
    (e: unknown) => e instanceof HostedError && e.code === 'context_limit',
  );
});
await test('native local streaming handles fragmented UTF-8 and aborts a blocked reader', async () => {
  const chunks = [];
  for await (const value of localEvents(
    stream('{"text":"你好"}\r\n{"text":"Zuri"}'),
    new AbortController().signal,
  ))
    chunks.push(value);
  assert.deepEqual(chunks, [{ text: '你好' }, { text: 'Zuri' }]);
  const abort = new AbortController(),
    events = localEvents(new ReadableStream(), abort.signal);
  const next = events.next();
  abort.abort();
  await assert.rejects(next, { name: 'AbortError' });
});
await test('local adapter sends a constrained schema with thinking off, streams text and validates usage without any key', async () => {
  const original = globalThis.fetch;
  try {
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, config.endpoint);
      assert.equal(new Headers(options!.headers).has('Authorization'), false);
      body = JSON.parse(options!.body as string);
      return new Response(stream(output()));
    };
    const shown: string[] = [];
    const result = await hostedResponse(
      config,
      hostedMessages(initialWorkspace(), 'Hello'),
      new AbortController().signal,
      (text) => shown.push(text),
    );
    assert.deepEqual(result, {
      reply: 'Hello, Zuri.',
      actions: [],
      usage: { input: 50, output: 20, total: 70 },
    });
    assert.equal(body!.think, false);
    assert.equal(body!.stream, true);
    assert.deepEqual(body!.format, LOCAL_RESPONSE_SCHEMA);
    assert.ok(shown.length > 1);
    assert.equal(shown.at(-1), result.reply);
  } finally {
    globalThis.fetch = original;
  }
});
await test('local output rejects truncation, foreign models, invalid actions and missing usage', async () => {
  const original = globalThis.fetch;
  try {
    for (const value of [
      output(undefined, 'length'),
      output().split('\n')[0] + '\n',
      output().replaceAll(config.model, 'other'),
      output('{"reply":"Hello","actions":[{"type":"shell"}]}'),
      output().replace('"prompt_eval_count":50,', ''),
      output() + '{"error":"private details"}\n',
    ]) {
      globalThis.fetch = async () => new Response(stream(value));
      await assert.rejects(
        hostedResponse(
          config,
          hostedMessages(initialWorkspace(), 'Hello'),
          new AbortController().signal,
          () => {},
        ),
        HostedError,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
await test('readiness distinguishes an installed local completion model from unavailable or remote models', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({ capabilities: ['completion'] });
    assert.equal(await localModelReady(config), true);
    globalThis.fetch = async () =>
      Response.json({
        capabilities: ['completion'],
        remote_model: 'remote',
        remote_host: 'https://example.com',
      });
    assert.equal(await localModelReady(config), false);
    globalThis.fetch = async () =>
      Response.json({ capabilities: ['embedding'] });
    assert.equal(await localModelReady(config), false);
    globalThis.fetch = async () => Response.json({}, { status: 404 });
    assert.equal(await localModelReady(config), false);
  } finally {
    globalThis.fetch = original;
  }
});
