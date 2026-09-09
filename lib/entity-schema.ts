export type Zone = 'center' | 'desk' | 'window';
// Records context exposure, not proof that a memory caused an action.
export type ActionOrigin = { runId: string; memoryIds: string[] };
export type EntityTask = {
  id: string;
  title: string;
  state: 'open' | 'done';
  createdAt: string;
  completedAt?: string;
  origin?: ActionOrigin;
};
export type SpatialNote = {
  id: string;
  text: string;
  zone: Zone;
  createdAt: string;
  origin?: ActionOrigin;
};
export type Relationship = {
  id: string;
  name: string;
  role: string;
  context: string;
  createdAt: string;
};
export type Receipt = {
  id: string;
  at: string;
  actor: 'you' | 'agent' | 'system';
  action: string;
  detail: string;
  model: string;
  memoryVersion?: number;
};
export type Entity = {
  id: string;
  bornAt: string;
  zone: Zone;
  tasks: EntityTask[];
  notes: SpatialNote[];
  relationships: Relationship[];
  receipts: Receipt[];
  permissions: { move: boolean; notes: boolean; tasks: boolean };
};
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number, empty = false): v is string =>
  typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0);
const date = (v: unknown) => str(v, 40) && Number.isFinite(Date.parse(v));
export const validVersion = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function validOrigin(v: unknown): v is ActionOrigin {
  return (
    obj(v) &&
    str(v.runId, 80) &&
    Array.isArray(v.memoryIds) &&
    v.memoryIds.length <= 8 &&
    v.memoryIds.every((id) => str(id, 80)) &&
    new Set(v.memoryIds).size === v.memoryIds.length
  );
}
function cleanOrigin(v: ActionOrigin): ActionOrigin {
  return { runId: v.runId, memoryIds: [...v.memoryIds] };
}
export const zones: Zone[] = ['center', 'desk', 'window'];
export function validEntity(v: unknown): v is Entity {
  if (
    !obj(v) ||
    !str(v.id, 80) ||
    !date(v.bornAt) ||
    !zones.includes(v.zone as Zone) ||
    !obj(v.permissions) ||
    !['move', 'notes', 'tasks'].every(
      (k) => typeof (v.permissions as Record<string, unknown>)[k] === 'boolean',
    )
  )
    return false;
  if (
    !Array.isArray(v.tasks) ||
    v.tasks.length > 100 ||
    !v.tasks.every(
      (t) =>
        obj(t) &&
        str(t.id, 80) &&
        str(t.title, 240) &&
        ['open', 'done'].includes(t.state as string) &&
        date(t.createdAt) &&
        (t.completedAt === undefined || date(t.completedAt)) &&
        (t.origin === undefined || validOrigin(t.origin)),
    )
  )
    return false;
  if (
    !Array.isArray(v.notes) ||
    v.notes.length > 40 ||
    !v.notes.every(
      (n) =>
        obj(n) &&
        str(n.id, 80) &&
        str(n.text, 1200) &&
        zones.includes(n.zone as Zone) &&
        date(n.createdAt) &&
        (n.origin === undefined || validOrigin(n.origin)),
    )
  )
    return false;
  if (
    !Array.isArray(v.relationships) ||
    v.relationships.length > 50 ||
    !v.relationships.every(
      (r) =>
        obj(r) &&
        str(r.id, 80) &&
        str(r.name, 80) &&
        str(r.role, 80) &&
        str(r.context, 1200, true) &&
        date(r.createdAt),
    )
  )
    return false;
  if (
    !Array.isArray(v.receipts) ||
    v.receipts.length > 200 ||
    !v.receipts.every(
      (r) =>
        obj(r) &&
        str(r.id, 80) &&
        date(r.at) &&
        ['you', 'agent', 'system'].includes(r.actor as string) &&
        str(r.action, 100) &&
        str(r.detail, 1500) &&
        str(r.model, 100) &&
        (r.memoryVersion === undefined || validVersion(r.memoryVersion)),
    )
  )
    return false;
  return [v.tasks, v.notes, v.relationships, v.receipts].every(
    (a) => new Set(a.map((x) => x.id)).size === a.length,
  );
}
export function cleanEntity(e: Entity): Entity {
  return {
    id: e.id,
    bornAt: e.bornAt,
    zone: e.zone,
    permissions: {
      move: e.permissions.move,
      notes: e.permissions.notes,
      tasks: e.permissions.tasks,
    },
    tasks: e.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      state: t.state,
      createdAt: t.createdAt,
      ...(t.completedAt ? { completedAt: t.completedAt } : {}),
      ...(t.origin ? { origin: cleanOrigin(t.origin) } : {}),
    })),
    notes: e.notes.map((n) => ({
      id: n.id,
      text: n.text,
      zone: n.zone,
      createdAt: n.createdAt,
      ...(n.origin ? { origin: cleanOrigin(n.origin) } : {}),
    })),
    relationships: e.relationships.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      context: r.context,
      createdAt: r.createdAt,
    })),
    receipts: e.receipts.map((r) => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      action: r.action,
      detail: r.detail,
      model: r.model,
      ...(r.memoryVersion !== undefined
        ? { memoryVersion: r.memoryVersion }
        : {}),
    })),
  };
}
