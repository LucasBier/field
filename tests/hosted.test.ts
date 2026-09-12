import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hostedConfig,
  HostedError,
  reserveMicros,
  usageMicros,
} from '../lib/hosted-config';
import { eventData, partialReply } from '../lib/event-stream';
import { hostedMessages, hostedResponse } from '../lib/hosted-provider';
import { initialWorkspace } from '../lib/field';
import { siteConversation } from '../lib/site-conversation';

const env = {
  FIELD_AI_ENABLED: 'true',
  FIELD_AI_KEY: 'test-only-not-a-real-key',
  FIELD_AI_DAILY_USD: '1',
  FIELD_AI_INPUT_USD_PER_MILLION: '1',
  FIELD_AI_OUTPUT_USD_PER_MILLION: '2',
};
const config = hostedConfig(env)!;
function stream(text: string, size = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size)
        controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
}
const sse = (value: unknown) =>
  `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`;
function providerEvents(
  reply = '{"reply":"Hello, Zuri.","actions":[]}',
  finish = 'stop',
  usage: unknown = {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
) {
  return (
    sse({ choices: [{ delta: { content: reply } }] }) +
    sse({ choices: [{ delta: {}, finish_reason: finish }], usage }) +
    sse('[DONE]')
  );
}

await test('hosted inference requires an explicit key, budget and rates; production has a fixed destination', () => {
  assert.equal(hostedConfig({}), null);
  for (const field of [
    'FIELD_AI_KEY',
    'FIELD_AI_DAILY_USD',
    'FIELD_AI_INPUT_USD_PER_MILLION',
    'FIELD_AI_OUTPUT_USD_PER_MILLION',
  ])
    assert.equal(hostedConfig({ ...env, [field]: '' }), null);
  for (const value of ['0', '-1', 'Infinity', 'invalid'])
    assert.equal(hostedConfig({ ...env, FIELD_AI_DAILY_USD: value }), null);
  assert.equal(hostedConfig({ ...env, FIELD_AI_CONCURRENCY: '1.5' }), null);
  assert.equal(hostedConfig({ ...env, FIELD_AI_MODEL: 'unapproved' }), null);
  assert.equal(
    hostedConfig({
      ...env,
      FIELD_AI_TEST_ENDPOINT: 'http://localhost:3003/chat',
    })?.endpoint,
    'https://api.deepseek.com/chat/completions',
  );
  for (const endpoint of [
    'https://example.com',
    'http://localhost.evil.test',
    'http://user:pass@localhost:3003',
    'file:///tmp/a',
  ])
    assert.equal(
      hostedConfig({ ...env, FIELD_AI_TEST_ENDPOINT: endpoint }, true),
      null,
    );
  assert.equal(
    hostedConfig(
      { ...env, FIELD_AI_TEST_ENDPOINT: 'http://127.0.0.1:3003/chat' },
      true,
    )?.endpoint,
    'http://127.0.0.1:3003/chat',
  );
});
await test('reservations count UTF-8 input and maximum output, with a strict context bound', () => {
  const content = [{ content: 'A conversation with Zuri.' }];
  assert.ok(reserveMicros(content, config) > usageMicros(100, 100, config));
  assert.ok(
    reserveMicros('你好'.repeat(500), config) >
      reserveMicros('ab'.repeat(500), config),
  );
  assert.throws(() => reserveMicros('x'.repeat(65537), config), HostedError);
});
await test('SSE decoding handles fragmented UTF-8, CRLF, multiple data lines and comments', async () => {
  const events = [];
  for await (const data of eventData(
    stream(': keepalive\r\ndata: 你好\r\ndata: Zuri\r\n\r\ndata: [DONE]\n\n'),
  ))
    events.push(data);
  assert.deepEqual(events, ['你好\nZuri', '[DONE]']);
});
await test('SSE decoding rejects truncated and oversized events and aborts a blocked read', async () => {
  const consume = async (
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ) => {
    for await (const value of eventData(body, signal))
      assert.equal(typeof value, 'string');
  };
  await assert.rejects(consume(stream('data: unfinished')));
  await assert.rejects(
    consume(stream('data: ' + 'x'.repeat(1_000_001), 100000)),
  );
  const abort = new AbortController();
  const pending = consume(new ReadableStream(), abort.signal);
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
await test('provisional speech decodes escapes without displaying action JSON or incomplete surrogate pairs', () => {
  assert.equal(
    partialReply('{"reply":"Hello\\nZuri\\u0021","actions":[{"type":"task"}]}'),
    'Hello\nZuri!',
  );
  assert.equal(
    partialReply('{"actions":[],"reply":"Hidden until complete"}'),
    '',
  );
  assert.equal(partialReply('{"reply":"Hello\\uD83D'), 'Hello');
  assert.equal(partialReply('{"reply":"Hello\\uD83D\\uDE00'), 'Hello😀');
  assert.equal(partialReply('{"reply":"Hello\\u00'), 'Hello');
});
await test('provider streams provisional text, validates complete actions and accepts final-chunk usage', async () => {
  const original = globalThis.fetch;
  try {
    let sent: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, options) => {
      sent = JSON.parse(options!.body as string);
      return new Response(stream(providerEvents()), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };
    const shown: string[] = [];
    const result = await hostedResponse(
      config,
      hostedMessages(initialWorkspace(), 'Hello'),
      new AbortController().signal,
      (value) => shown.push(value),
    );
    assert.deepEqual(result, {
      reply: 'Hello, Zuri.',
      actions: [],
      usage: { input: 10, output: 5, total: 15 },
    });
    assert.deepEqual(shown, ['Hello, Zuri.']);
    assert.equal(sent!.stream, true);
    assert.deepEqual(sent!.stream_options, { include_usage: true });
  } finally {
    globalThis.fetch = original;
  }
});
await test('provider rejects truncation, invalid actions and inconsistent usage without exposing raw errors', async () => {
  const original = globalThis.fetch;
  try {
    for (const output of [
      providerEvents().replace('data: [DONE]\n\n', ''),
      providerEvents('{"reply":"Hi","actions":[]}', 'length'),
      providerEvents(
        '{"reply":"Hi","actions":[{"type":"shell","command":"unsafe"}]}',
      ),
      providerEvents('{"reply":"Hi","actions":[]}', 'stop', {
        prompt_tokens: null,
        completion_tokens: 5,
        total_tokens: 5,
      }),
      providerEvents('{"reply":"Hi","actions":[]}', 'stop', {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 16,
      }),
      sse({ error: { message: 'provider-secret-debug-data' } }),
    ]) {
      globalThis.fetch = async () => new Response(stream(output));
      await assert.rejects(
        hostedResponse(
          config,
          hostedMessages(initialWorkspace(), 'Hello'),
          new AbortController().signal,
          () => {},
        ),
        (error: unknown) =>
          error instanceof HostedError &&
          !error.message.includes('provider-secret'),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

await test('browser client sends only the message, revision and id, and waits for a saved terminal event', async () => {
  const original = globalThis.fetch,
    id = 'test-id';
  try {
    const requests: unknown[] = [],
      shown: string[] = [];
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options!.body as string));
      return new Response(
        stream(
          sse({ type: 'text', text: 'Hello' }) +
            sse({ type: 'done', id, status: 'completed' }),
        ),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    };
    await siteConversation(id, 'Hi', 4, new AbortController().signal, (text) =>
      shown.push(text),
    );
    assert.deepEqual(requests, [{ id, message: 'Hi', revision: 4 }]);
    assert.deepEqual(shown, ['Hello']);
  } finally {
    globalThis.fetch = original;
  }
});
await test('browser reconciles an uncertain stream through stop without repeating inference; an already committed result wins', async () => {
  const original = globalThis.fetch;
  try {
    const methods: string[] = [];
    globalThis.fetch = async (_url, options) => {
      methods.push(options!.method!);
      if (options!.method === 'DELETE')
        return Response.json({ status: 'completed' });
      return new Response(stream(sse({ type: 'text', text: 'Partial' })), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };
    await siteConversation(
      'id',
      'Hi',
      1,
      new AbortController().signal,
      () => {},
    );
    assert.deepEqual(methods, ['POST', 'DELETE']);
  } finally {
    globalThis.fetch = original;
  }
});
await test('browser leaves rejected requests unstarted and confirms stop after a network abort', async () => {
  const original = globalThis.fetch;
  try {
    let count = 0;
    globalThis.fetch = async () => {
      count++;
      return Response.json({ error: 'Allowance reached.' }, { status: 429 });
    };
    await assert.rejects(
      siteConversation('id', 'Hi', 1, new AbortController().signal, () => {}),
      /Allowance/,
    );
    assert.equal(count, 1);
    const abort = new AbortController();
    abort.abort();
    const methods: string[] = [];
    globalThis.fetch = async (_url, options) => {
      methods.push(options!.method!);
      if (options!.method === 'DELETE')
        return Response.json({ status: 'cancelled' });
      throw new DOMException('Stopped', 'AbortError');
    };
    await assert.rejects(
      siteConversation('id', 'Hi', 1, abort.signal, () => {}),
      /Response stopped/,
    );
    assert.deepEqual(methods, ['POST', 'DELETE']);
  } finally {
    globalThis.fetch = original;
  }
});
