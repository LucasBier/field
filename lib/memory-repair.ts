import { stamp, uid, type Memory, type Workspace } from './field';
import { receipt } from './entity';
import { cleanEntity, type ActionOrigin } from './entity-schema';

export type RepairItem = {
  key: string;
  kind: 'task' | 'note';
  id: string;
  text: string;
  contextMatch: boolean;
  origin?: ActionOrigin;
};
export type RepairPreview = {
  memory: Memory;
  replacement: string;
  version: number;
  items: RepairItem[];
  recordSnapshot: string;
};
export type RepairDecision = {
  key: string;
  action: 'keep' | 'rewrite' | 'remove';
  text?: string;
};

function recordSnapshot(w: Workspace) {
  return JSON.stringify({ tasks: w.entity?.tasks, notes: w.entity?.notes });
}

/** A context match indicates exposure, never a proven causal dependency. */
export function previewMemoryRepair(
  w: Workspace,
  memoryId: string,
  replacement: string,
): RepairPreview {
  const memory = w.memories.find((m) => m.id === memoryId);
  if (!memory || memory.source !== 'user' || memory.supersededBy)
    throw new Error(
      'This memory is no longer current. Open its latest version.',
    );
  const text = replacement.trim();
  if (!text || text.length > 3000 || text === memory.text.trim())
    throw new Error('Write a different understanding, up to 3,000 characters.');
  if (w.memories.length >= 200)
    throw new Error(
      'Memory is full. Remove a record before keeping a revision.',
    );
  if (!w.entity) throw new Error('Your space is still loading.');
  if ((w.memoryVersion || 0) >= Number.MAX_SAFE_INTEGER)
    throw new Error('Memory version limit reached.');
  const lineage = new Set([memoryId]);
  let ancestor = memory.supersedes;
  while (ancestor && !lineage.has(ancestor)) {
    lineage.add(ancestor);
    ancestor = w.memories.find((m) => m.id === ancestor)?.supersedes;
  }
  const items: RepairItem[] = [
    ...w.entity.tasks
      .filter((t) => t.state === 'open')
      .map((t) => ({
        key: `task:${t.id}`,
        kind: 'task' as const,
        id: t.id,
        text: t.title,
        origin: t.origin,
        contextMatch: !!t.origin?.memoryIds.some((id) => lineage.has(id)),
      })),
    ...w.entity.notes.map((n) => ({
      key: `note:${n.id}`,
      kind: 'note' as const,
      id: n.id,
      text: n.text,
      origin: n.origin,
      contextMatch: !!n.origin?.memoryIds.some((id) => lineage.has(id)),
    })),
  ].sort((a, b) => Number(b.contextMatch) - Number(a.contextMatch));
  return {
    memory: { ...memory },
    replacement: text,
    version: w.memoryVersion || 0,
    items,
    recordSnapshot: recordSnapshot(w),
  };
}

/** Validate a reviewed snapshot, then commit the correction and chosen edits together. */
export function applyMemoryRepair(
  w: Workspace,
  preview: RepairPreview,
  decisions: RepairDecision[],
): Workspace {
  const fresh = previewMemoryRepair(w, preview.memory.id, preview.replacement);
  if (
    fresh.version !== preview.version ||
    JSON.stringify(fresh.memory) !== JSON.stringify(preview.memory) ||
    fresh.recordSnapshot !== preview.recordSnapshot ||
    JSON.stringify(fresh.items) !== JSON.stringify(preview.items)
  )
    throw new Error(
      'Your memory or plans changed. Preview the correction again.',
    );
  if (
    decisions.length !== fresh.items.length ||
    new Set(decisions.map((d) => d.key)).size !== decisions.length
  )
    throw new Error('Review each plan and room note before confirming.');
  for (const decision of decisions) {
    const item = fresh.items.find((i) => i.key === decision.key);
    if (!item || !['keep', 'rewrite', 'remove'].includes(decision.action))
      throw new Error('An item in this review is no longer available.');
    if (
      decision.action === 'rewrite' &&
      (typeof decision.text !== 'string' ||
        !decision.text.trim() ||
        decision.text.trim().length > (item.kind === 'task' ? 240 : 1200))
    )
      throw new Error(
        'Give every rewritten item valid text before confirming.',
      );
  }
  const old = fresh.memory;
  const revised: Memory = {
    id: uid(),
    text: fresh.replacement,
    source: 'user',
    createdAt: stamp(),
    supersedes: old.id,
    ...(old.pinned !== undefined ? { pinned: old.pinned } : {}),
  };
  let next: Workspace = {
    ...w,
    memoryVersion: fresh.version + 1,
    memories: [
      ...w.memories.map((m) =>
        m.id === old.id ? { ...m, supersededBy: revised.id } : m,
      ),
      revised,
    ],
    entity: cleanEntity(w.entity!),
  };
  for (const decision of decisions) {
    if (decision.action === 'keep') continue;
    const item = fresh.items.find((i) => i.key === decision.key)!;
    const entity = next.entity!;
    if (item.kind === 'task') {
      entity.tasks =
        decision.action === 'remove'
          ? entity.tasks.filter((t) => t.id !== item.id)
          : entity.tasks.map((t) =>
              t.id === item.id ? { ...t, title: decision.text!.trim() } : t,
            );
    } else {
      entity.notes =
        decision.action === 'remove'
          ? entity.notes.filter((n) => n.id !== item.id)
          : entity.notes.map((n) =>
              n.id === item.id ? { ...n, text: decision.text!.trim() } : n,
            );
    }
  }
  const changed = decisions.filter((d) => d.action !== 'keep').length;
  next = receipt(
    next,
    'memory_repaired',
    `Corrected one memory and kept its earlier version in history. Reviewed ${decisions.length} plans and room notes; changed ${changed}. Started a fresh conversation context.`,
    'you',
    'Memory review',
  );
  return next;
}
