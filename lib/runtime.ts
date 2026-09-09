import { applyEntityActions, receipt, type EntityAction } from './entity';
import { stamp, uid, type Memory, type Workspace } from './field';
import { retrieveMemories } from './memory';
import type { AgentRun, TokenUsage, RunFailure } from './runtime-schema';

export function beginTurn(
  w: Workspace,
  text: string,
  connection: { provider: AgentRun['provider']; model?: string },
) {
  const run: AgentRun = {
    id: uid(),
    requestId: uid(),
    provider: connection.provider,
    model: connection.provider === 'demo' ? 'Demo' : connection.model!,
    status: 'running',
    startedAt: stamp(),
    receiptIds: [],
    memoryVersion: w.memoryVersion || 0,
    ...(connection.provider !== 'demo'
      ? { memory: retrieveMemories(w.memories, text).selection }
      : {}),
  };
  const workspace: Workspace = {
    ...w,
    runs: [...(w.runs || []), run].slice(-40),
    messages: [
      ...w.messages,
      {
        id: run.requestId,
        role: 'user',
        text,
        createdAt: run.startedAt,
        mode: run.provider === 'demo' ? 'demo' : 'model',
        memoryVersion: run.memoryVersion,
      },
    ].slice(-250) as Workspace['messages'],
  };
  return { workspace, run };
}

function running(w: Workspace, id: string) {
  const run = w.runs?.find((r) => r.id === id);
  if (!run || run.status !== 'running')
    throw new Error('This request has already ended. No actions were applied.');
  return run;
}
function ended(run: AgentRun) {
  // A wall-clock adjustment must not make a valid workspace unsaveable.
  const end = Math.max(Date.now(), Date.parse(run.startedAt));
  return {
    finishedAt: new Date(end).toISOString(),
    latencyMs: end - Date.parse(run.startedAt),
  };
}
export function completeTurn(
  w: Workspace,
  id: string,
  result: {
    reply: string;
    actions: EntityAction[];
    usage?: TokenUsage;
    memory?: Memory;
  },
  signal: AbortSignal,
): Workspace {
  signal.throwIfAborted();
  const run = running(w, id);
  if (
    (run.memoryVersion || 0) !== (w.memoryVersion || 0) ||
    run.memory?.matches.some(
      (match) => !w.memories.some((m) => m.id === match.id && !m.supersededBy),
    )
  )
    throw new Error(
      'Memory context changed. Send your message again to use the current understanding.',
    );
  if (!result.reply.trim() || result.reply.length > 6000)
    throw new Error('The response was not valid. No actions were applied.');
  // One immutable transaction: a rejected action cannot leave a reply or partial changes.
  let next = applyEntityActions(w, result.actions, 'agent', run.model);
  const origin = {
    runId: run.id,
    memoryIds: run.memory?.matches.map((m) => m.id) || [],
  };
  next.entity!.tasks = next.entity!.tasks.map((task) =>
    w.entity!.tasks.some((old) => old.id === task.id)
      ? task
      : { ...task, origin },
  );
  next.entity!.notes = next.entity!.notes.map((note) =>
    w.entity!.notes.some((old) => old.id === note.id)
      ? note
      : { ...note, origin },
  );
  if (result.memory) {
    if (
      w.memories.length >= 200 ||
      w.memories.some((m) => m.id === result.memory!.id)
    )
      throw new Error('Memory is full or already saved.');
    next = receipt(
      { ...next, memories: [...next.memories, result.memory] },
      'memory_saved',
      'Saved a statement provided by you.',
      'you',
      'Demo',
    );
  }
  const previousReceipts = new Set(w.entity?.receipts.map((r) => r.id));
  const replyId = uid();
  const finished: AgentRun = {
    ...run,
    ...ended(run),
    status: 'completed',
    replyId,
    receiptIds:
      next.entity?.receipts
        .filter((r) => !previousReceipts.has(r.id))
        .map((r) => r.id) || [],
    ...(result.usage ? { usage: result.usage } : {}),
  };
  return {
    ...next,
    runs: next.runs!.map((r) => (r.id === id ? finished : r)),
    messages: [
      ...next.messages,
      {
        id: replyId,
        role: 'assistant',
        text: result.reply,
        createdAt: finished.finishedAt!,
        mode: run.provider === 'demo' ? 'demo' : 'model',
        memoryVersion: run.memoryVersion,
      },
    ].slice(-250) as Workspace['messages'],
  };
}
export function classifyFailure(error: unknown): RunFailure {
  const message = error instanceof Error ? error.message : '';
  if (/Memory context changed/i.test(message)) return 'context_changed';
  if (/permission/i.test(message)) return 'permission';
  if (/save|storage|workspace|revision/i.test(message)) return 'storage';
  if (
    /format|validat|unsupported|incomplete|json|batch|task.*missing|already complete|shelf is full/i.test(
      message,
    )
  )
    return 'invalid_response';
  if (
    /ollama|provider|fetch|model|network|key|credit|rate limit/i.test(message)
  )
    return 'provider';
  return 'unknown';
}
export function stopTurn(
  w: Workspace,
  id: string,
  status: 'failed' | 'cancelled',
  failure: RunFailure = status === 'cancelled' ? 'cancelled' : 'unknown',
): Workspace {
  const run = running(w, id);
  return {
    ...w,
    runs: w.runs!.map((r) =>
      r.id === id ? { ...run, ...ended(run), status, failure } : r,
    ),
  };
}
