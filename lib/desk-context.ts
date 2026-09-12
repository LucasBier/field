import type { DeskState, DeskView } from './desk';

export function deskContext(s: DeskState | DeskView) {
  return {
    source: 'Field task ledger',
    observedAt: new Date().toISOString(),
    tasks: s.tasks.slice(-3).map((t) => ({
      instruction: t.instruction,
      mode: t.mode,
      status: t.status,
      updatedAt: new Date(t.updatedAt).toISOString(),
      verification: t.verdict ?? null,
      latestEvent: t.events.at(-1)?.text,
    })),
  };
}
export type DeskContext = ReturnType<typeof deskContext>;
