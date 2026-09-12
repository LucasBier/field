import { ENTITY_SYSTEM, entityContext, validEntityActions } from './entity';
import type { Workspace } from './field';
import { validUsage, type TokenUsage } from './runtime-schema';
import { HostedError, type HostedConfig } from './hosted-config';
import { eventData, partialReply } from './event-stream';
import { localResponse } from './local-provider';
import type { DeskContext } from './desk-context';

export function hostedMessages(
  w: Workspace,
  request: string,
  desk?: DeskContext,
) {
  return [
    {
      role: 'system',
      content:
        ENTITY_SYSTEM +
        ' Put the reply key first, then actions. The reply is provisional until the runtime validates the full response.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        context: { ...entityContext(w, request), desk },
        request,
      }),
    },
  ];
}
export async function hostedResponse(
  config: HostedConfig,
  messages: ReturnType<typeof hostedMessages>,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  if (config.provider === 'ollama')
    return localResponse(config, messages, signal, onText);
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      thinking: { type: 'disabled' },
      max_tokens: config.maxOutput,
      response_format: { type: 'json_object' },
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });
  if (!response.ok || !response.body) throw new HostedError('provider', 502);
  let raw = '',
    shown = '',
    finished = false,
    done = false;
  let usage: TokenUsage | undefined;
  try {
    for await (const data of eventData(response.body, signal)) {
      if (data === '[DONE]') {
        done = true;
        break;
      }
      const chunk = JSON.parse(data);
      if (chunk.error) throw new HostedError('provider', 502);
      if (!Array.isArray(chunk.choices) || chunk.choices.length > 1)
        throw new HostedError('invalid_response');
      const choice = chunk.choices[0];
      if (choice?.delta?.tool_calls || choice?.delta?.refusal)
        throw new HostedError('invalid_response');
      const content = choice?.delta?.content;
      if (content !== undefined && content !== null) {
        if (typeof content !== 'string' || (finished && content))
          throw new HostedError('invalid_response');
        raw += content;
        if (raw.length > 60000) throw new HostedError('invalid_response');
        const preview = partialReply(raw);
        if (preview.length > 6000) throw new HostedError('invalid_response');
        if (preview !== shown) {
          shown = preview;
          onText(preview);
        }
      }
      if (choice?.finish_reason != null) {
        if (choice.finish_reason !== 'stop')
          throw new HostedError('invalid_response');
        finished = true;
      }
      if (chunk.usage) {
        const value = {
          input: chunk.usage.prompt_tokens,
          output: chunk.usage.completion_tokens,
          total: chunk.usage.total_tokens,
        };
        if (
          !validUsage(value) ||
          value.input === null ||
          value.output === null ||
          value.total === null ||
          value.input + value.output !== value.total ||
          value.input > 1_000_000 ||
          value.output > config.maxOutput
        )
          throw new HostedError('invalid_response');
        usage = value;
      }
    }
    signal.throwIfAborted();
    if (!done || !finished || !usage) throw new HostedError('invalid_response');
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
