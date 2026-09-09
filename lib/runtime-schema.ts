import type { MemorySelection } from './memory';
import { validVersion } from './entity-schema';

export type TokenUsage = {
  input: number | null;
  output: number | null;
  total: number | null;
};
export const RUN_FAILURES = {
  context_changed:
    'Memory changed while this response was being prepared. Send your message again to use the current understanding.',
  cancelled: 'Stopped by the user or interrupted by navigation.',
  timeout: 'The response exceeded its time limit.',
  permission: 'An action was denied by the current permissions.',
  provider:
    'The model could not be reached or rejected the request. Check the connection and provider account.',
  invalid_response:
    'The response or action batch did not satisfy the runtime contract.',
  storage:
    'Workspace storage did not confirm the request. Check the save indicator before retrying.',
  unknown: 'The request could not complete. No model actions were committed.',
} as const;
export type RunFailure = keyof typeof RUN_FAILURES;
export type AgentRun = {
  id: string;
  requestId: string;
  provider: 'demo' | 'ollama' | 'deepseek' | 'site';
  model: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  latencyMs?: number;
  memory?: MemorySelection;
  memoryVersion?: number;
  receiptIds: string[];
  replyId?: string;
  usage?: TokenUsage;
  failure?: RunFailure;
};

const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, n: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= n;
const date = (v: unknown) => str(v, 40) && Number.isFinite(Date.parse(v));
const count = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function validUsage(v: unknown): v is TokenUsage {
  return (
    obj(v) &&
    ['input', 'output', 'total'].every(
      (key) => v[key] === null || count(v[key]),
    )
  );
}
export function validRuns(v: unknown): v is AgentRun[] {
  if (
    !Array.isArray(v) ||
    v.length > 40 ||
    new Set(v.map((r) => r?.id)).size !== v.length
  )
    return false;
  return v.every((r) => {
    if (
      !obj(r) ||
      !str(r.id, 80) ||
      !str(r.requestId, 80) ||
      !str(r.model, 100) ||
      !['demo', 'ollama', 'deepseek', 'site'].includes(r.provider as string) ||
      !['running', 'completed', 'failed', 'cancelled'].includes(
        r.status as string,
      ) ||
      !date(r.startedAt) ||
      !Array.isArray(r.receiptIds) ||
      r.receiptIds.length > 5 ||
      !r.receiptIds.every((id) => str(id, 80)) ||
      (r.replyId !== undefined && !str(r.replyId, 80)) ||
      (r.usage !== undefined && !validUsage(r.usage)) ||
      (r.memoryVersion !== undefined && !validVersion(r.memoryVersion))
    )
      return false;
    if (
      r.failure !== undefined &&
      (!Object.hasOwn(RUN_FAILURES, r.failure as string) ||
        !['failed', 'cancelled'].includes(r.status as string))
    )
      return false;
    if (r.status === 'running') {
      if (
        r.finishedAt !== undefined ||
        r.latencyMs !== undefined ||
        r.replyId !== undefined ||
        r.receiptIds.length ||
        r.usage !== undefined
      )
        return false;
    } else if (
      !date(r.finishedAt) ||
      !count(r.latencyMs) ||
      Date.parse(r.finishedAt as string) < Date.parse(r.startedAt as string)
    )
      return false;
    if (r.status === 'completed' && !str(r.replyId, 80)) return false;
    if (
      ['failed', 'cancelled'].includes(r.status as string) &&
      (r.replyId !== undefined || r.receiptIds.length || r.usage !== undefined)
    )
      return false;
    if (r.memory !== undefined) {
      const m = r.memory;
      if (
        !obj(m) ||
        m.method !== 'bm25-v1' ||
        m.budget !== 6000 ||
        !count(m.chars) ||
        (m.chars as number) > 6000 ||
        m.estimatedTokens !== Math.ceil((m.chars as number) / 4) ||
        !Array.isArray(m.matches) ||
        m.matches.length > 8 ||
        new Set(m.matches.map((x) => x?.id)).size !== m.matches.length ||
        !m.matches.every(
          (x) =>
            obj(x) &&
            str(x.id, 80) &&
            typeof x.score === 'number' &&
            Number.isFinite(x.score) &&
            x.score >= 0 &&
            ['pinned', 'relevant', 'recent'].includes(x.reason as string) &&
            count(x.chars) &&
            (x.chars as number) <= 1000 &&
            typeof x.truncated === 'boolean',
        ) ||
        m.matches.reduce((sum, x) => sum + x.chars, 0) !== m.chars
      )
        return false;
    }
    return true;
  });
}
/** Whitelist every nested field so an imported trace cannot retain credentials. */
export function cleanRun(r: AgentRun): AgentRun {
  return {
    id: r.id,
    requestId: r.requestId,
    provider: r.provider,
    model: r.model,
    status: r.status,
    startedAt: r.startedAt,
    ...(r.memoryVersion !== undefined
      ? { memoryVersion: r.memoryVersion }
      : {}),
    ...(r.finishedAt !== undefined
      ? { finishedAt: r.finishedAt, latencyMs: r.latencyMs }
      : {}),
    receiptIds: [...r.receiptIds],
    ...(r.replyId ? { replyId: r.replyId } : {}),
    ...(r.failure ? { failure: r.failure } : {}),
    ...(r.usage
      ? {
          usage: {
            input: r.usage.input,
            output: r.usage.output,
            total: r.usage.total,
          },
        }
      : {}),
    ...(r.memory
      ? {
          memory: {
            method: r.memory.method,
            budget: r.memory.budget,
            chars: r.memory.chars,
            estimatedTokens: r.memory.estimatedTokens,
            matches: r.memory.matches.map((m) => ({
              id: m.id,
              score: m.score,
              reason: m.reason,
              chars: m.chars,
              truncated: m.truncated,
            })),
          },
        }
      : {}),
  };
}
