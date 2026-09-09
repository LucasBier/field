import { validEntityActions } from './entity';
import { partialReply } from './event-stream';
import { HostedError, type HostedConfig } from './hosted-config';
import { validUsage, type TokenUsage } from './runtime-schema';

const zone = { type: 'string', enum: ['center', 'desk', 'window'] };
const action = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
// String length limits stay in runtime validation; large grammar repetitions
// exceed the local sampler rule budget. Shape and action types are constrained here.
export const LOCAL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', minLength: 1 },
    actions: {
      type: 'array',
      maxItems: 4,
      items: {
        anyOf: [
          action({ type: { const: 'move' }, zone }),
          action({
            type: { const: 'note' },
            text: { type: 'string', minLength: 1 },
            zone,
          }),
          action({
            type: { const: 'task' },
            title: { type: 'string', minLength: 1 },
          }),
          action({
            type: { const: 'complete_task' },
            taskId: { type: 'string', minLength: 1 },
          }),
        ],
      },
    },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
};

/** Bounded native Ollama NDJSON; an incomplete final object cannot become a reply. */
export async function* localEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
) {
  const reader = body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '',
    bytes = 0;
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1_000_000) throw new HostedError('invalid_response');
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line) yield JSON.parse(line);
      }
    }
    signal.throwIfAborted();
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer);
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function localModelReady(config: HostedConfig) {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as {
      remote_model?: string;
      remote_host?: string;
      capabilities?: string[];
    };
    return (
      !data.remote_model &&
      !data.remote_host &&
      !!data.capabilities?.includes('completion')
    );
  } catch {
    return false;
  }
}

export async function localResponse(
  config: HostedConfig,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        think: false,
        format: LOCAL_RESPONSE_SCHEMA,
        keep_alive: '10m',
        options: {
          num_ctx: 16384,
          num_predict: config.maxOutput,
          temperature: 0.7,
        },
      }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new HostedError('local_unavailable', 503);
  }
  if (!response.ok || !response.body)
    throw new HostedError(
      response.status === 400 ? 'invalid_response' : 'local_unavailable',
      503,
    );
  let raw = '',
    shown = '',
    done = false;
  let usage: TokenUsage | undefined;
  try {
    for await (const chunk of localEvents(response.body, signal)) {
      if (
        !chunk ||
        typeof chunk !== 'object' ||
        chunk.error ||
        chunk.model !== config.model ||
        chunk.message?.tool_calls?.length ||
        done
      )
        throw new HostedError('invalid_response');
      const content = chunk.message?.content;
      if (typeof content !== 'string')
        throw new HostedError('invalid_response');
      raw += content;
      if (raw.length > 60000) throw new HostedError('invalid_response');
      const text = partialReply(raw);
      if (text.length > 6000) throw new HostedError('invalid_response');
      if (text !== shown) {
        shown = text;
        onText(text);
      }
      if (chunk.done === true) {
        if (chunk.done_reason !== 'stop')
          throw new HostedError('invalid_response');
        const value = {
          input: chunk.prompt_eval_count,
          output: chunk.eval_count,
          total: chunk.prompt_eval_count + chunk.eval_count,
        };
        if (
          !validUsage(value) ||
          value.input === null ||
          value.output === null ||
          value.total === null ||
          value.input > 16384 ||
          value.output > config.maxOutput ||
          value.input + value.output !== value.total
        )
          throw new HostedError('invalid_response');
        usage = value;
        done = true;
      } else if (chunk.done !== false)
        throw new HostedError('invalid_response');
    }
    signal.throwIfAborted();
    if (!done || !usage) throw new HostedError('invalid_response');
    const result = JSON.parse(raw);
    if (
      typeof result.reply !== 'string' ||
      !result.reply.trim() ||
      result.reply.length > 6000 ||
      !validEntityActions(result.actions)
    )
      throw new HostedError('invalid_response');
    return { reply: result.reply, actions: result.actions, usage };
  } catch (error) {
    if (signal.aborted) throw error;
    throw error instanceof HostedError
      ? error
      : new HostedError('invalid_response');
  }
}
