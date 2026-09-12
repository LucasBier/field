import {
  ENTITY_SYSTEM,
  entityContext,
  validEntityActions,
  applyEntityActions,
  type EntityAction,
} from './entity';
import { type Workspace } from './field';
import { validUsage } from './runtime-schema';
import { deskContext, type DeskContext } from './desk-context';
import type { DeskView } from './desk';
export type AgentConnection =
  | { provider: 'demo' }
  | { provider: 'site'; model: string }
  | { provider: 'deepseek'; model: string; key: string }
  | { provider: 'ollama'; model: string };
export type AgentResponse = {
  reply: string;
  actions: EntityAction[];
  usage?: { input: number | null; output: number | null; total: number | null };
};
export const LOCAL_OLLAMA = 'http://localhost:11434';
export async function discoverLocalModels(): Promise<string[]> {
  const response = await fetch(`${LOCAL_OLLAMA}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Ollama did not return a model list.');
  const data = (await response.json()) as { models?: { name?: string }[] };
  return (data.models || []).map((m) => m.name || '').filter(Boolean);
}
export function localRequest(
  w: Workspace,
  message: string,
  model: string,
  desk?: DeskContext,
) {
  return {
    model,
    messages: [
      { role: 'system', content: ENTITY_SYSTEM },
      {
        role: 'user',
        content: JSON.stringify({
          context: { ...entityContext(w, message), desk },
          request: message,
        }),
      },
    ],
    format: 'json',
    stream: false,
    think: false,
    options: { num_predict: 1800, num_ctx: 16384, temperature: 0.6 },
  };
}
export async function runAgent(
  connection: Exclude<AgentConnection, { provider: 'demo' | 'site' }>,
  w: Workspace,
  message: string,
  signal: AbortSignal,
): Promise<AgentResponse> {
  if (connection.provider === 'deepseek') {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surface: 'space',
        model: connection.model,
        key: connection.key,
        workspace: w,
        message,
      }),
      signal,
    });
    const data = (await response.json()) as AgentResponse & { error?: string };
    if (!response.ok)
      throw new Error(data.error || 'The model request failed.');
    if (
      typeof data.reply !== 'string' ||
      !data.reply.trim() ||
      data.reply.length > 6000 ||
      !validEntityActions(data.actions) ||
      (data.usage !== undefined && !validUsage(data.usage))
    )
      throw new Error(
        'The provider response could not be validated. Nothing changed.',
      );
    applyEntityActions(w, data.actions);
    return data;
  }
  let response: Response;
  const deskResponse = await fetch('/api/desk', { cache: 'no-store', signal });
  if (!deskResponse.ok)
    throw new Error(
      'The desk record is unavailable. Refresh your space before continuing.',
    );
  const desk = deskContext((await deskResponse.json()) as DeskView);
  try {
    response = await fetch(`${LOCAL_OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localRequest(w, message, connection.model, desk)),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(
      'Could not reach local Ollama. Check that it is running, allows this site’s origin, and that your browser permits local-network access.',
    );
  }
  if (!response.ok)
    throw new Error(
      `Ollama returned an error (${response.status}). Confirm the selected model is installed.`,
    );
  const data = (await response.json()) as {
    done?: boolean;
    done_reason?: string;
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  if (!data.done || data.done_reason === 'length')
    throw new Error(
      'The local response was incomplete. No actions were applied.',
    );
  let result: AgentResponse;
  try {
    result = JSON.parse(data.message?.content || '{}');
  } catch {
    throw new Error(
      'This local model did not return the required action format. Try a model with stronger JSON support.',
    );
  }
  if (
    typeof result.reply !== 'string' ||
    !result.reply.trim() ||
    result.reply.length > 6000 ||
    !validEntityActions(result.actions)
  )
    throw new Error(
      'The local model returned an unsupported action. Nothing changed.',
    );
  applyEntityActions(w, result.actions);
  const usage = {
    input: data.prompt_eval_count ?? null,
    output: data.eval_count ?? null,
    total:
      typeof data.prompt_eval_count === 'number' &&
      typeof data.eval_count === 'number'
        ? data.prompt_eval_count + data.eval_count
        : null,
  };
  if (!validUsage(usage))
    throw new Error(
      'The provider returned invalid usage data. No actions were applied.',
    );
  return { reply: result.reply, actions: result.actions, usage };
}
