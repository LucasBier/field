import { cleanEntity, validEntity, validVersion } from './entity-schema';
import { cleanRun, validRuns } from './runtime-schema';
import { COLORS, formula, period, validParams, type Workspace } from './field';
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, n: number, allowEmpty = false): v is string =>
  typeof v === 'string' && v.length <= n && (allowEmpty || v.trim().length > 0);
const date = (v: unknown) => text(v, 40) && Number.isFinite(Date.parse(v));
export function validWorkspace(v: unknown): v is Workspace {
  if (
    !record(v) ||
    !record(v.profile) ||
    !text(v.profile.name, 40) ||
    !text(v.profile.purpose, 600)
  )
    return false;
  if (
    !Array.isArray(v.experiments) ||
    !v.experiments.length ||
    v.experiments.length > 80 ||
    !Array.isArray(v.messages) ||
    v.messages.length > 250 ||
    !Array.isArray(v.memories) ||
    v.memories.length > 200
  )
    return false;
  if (
    !v.experiments.every(
      (e) =>
        record(e) &&
        text(e.id, 80) &&
        text(e.title, 120) &&
        (e.kind === 'pendulum' || e.kind === 'spring') &&
        validParams(e.params) &&
        COLORS.includes(e.color as string) &&
        (e.parentId === null || text(e.parentId, 80)) &&
        date(e.createdAt),
    )
  )
    return false;
  if (
    !v.experiments.every((e) =>
      !e.baseline
        ? e.parentId === null
        : record(e.baseline) &&
          text(e.baseline.title, 120) &&
          (e.baseline.kind === 'pendulum' || e.baseline.kind === 'spring') &&
          validParams(e.baseline.params) &&
          COLORS.includes(e.baseline.color as string),
    )
  )
    return false;
  if (v.entity !== undefined && !validEntity(v.entity)) return false;
  if (v.runs !== undefined && !validRuns(v.runs)) return false;
  if (v.memoryVersion !== undefined && !validVersion(v.memoryVersion))
    return false;
  const version = (v.memoryVersion as number) || 0;
  if (
    v.runs &&
    (v.runs as Workspace['runs'])!.some((r) => (r.memoryVersion || 0) > version)
  )
    return false;
  if (
    v.entity &&
    (v.entity as Workspace['entity'])!.receipts.some(
      (r) => (r.memoryVersion || 0) > version,
    )
  )
    return false;
  const ids = new Set(v.experiments.map((e) => e.id));
  if (
    ids.size !== v.experiments.length ||
    !ids.has(v.selectedId) ||
    v.experiments.some(
      (e) =>
        e.parentId !== null && (!ids.has(e.parentId) || e.parentId === e.id),
    )
  )
    return false;
  if (
    !v.messages.every(
      (m) =>
        record(m) &&
        text(m.id, 80) &&
        text(m.text, 6000) &&
        (m.role === 'user' || m.role === 'assistant') &&
        (m.mode === 'demo' || m.mode === 'model') &&
        date(m.createdAt) &&
        (m.memoryVersion === undefined ||
          (validVersion(m.memoryVersion) &&
            m.memoryVersion <= ((v.memoryVersion as number) || 0))),
    )
  )
    return false;
  if (
    !v.memories.every((m) => {
      if (
        !record(m) ||
        !text(m.id, 80) ||
        !text(m.text, 3000) ||
        !date(m.createdAt)
      )
        return false;
      if (m.pinned !== undefined && typeof m.pinned !== 'boolean') return false;
      if (
        [m.supersedes, m.supersededBy].some(
          (id) => id !== undefined && (!text(id, 80) || id === m.id),
        )
      )
        return false;
      if (m.source === 'user') return m.evidence === undefined;
      if (m.supersedes !== undefined || m.supersededBy !== undefined)
        return false;
      const e = m.evidence;
      if (
        m.source !== 'experiment' ||
        !record(e) ||
        !text(e.experimentId, 80) ||
        !text(e.title, 120) ||
        !validParams(e.params) ||
        (e.kind !== 'pendulum' && e.kind !== 'spring')
      )
        return false;
      return (
        e.formula === formula(e.kind) &&
        typeof e.period === 'number' &&
        Math.abs(e.period - period({ kind: e.kind, params: e.params })) < 1e-9
      );
    })
  )
    return false;
  // Missing links represent deleted records. Present links must agree and be acyclic.
  const typedMemories = v.memories as Workspace['memories'];
  const memories = new Map(typedMemories.map((m) => [m.id, m]));
  for (const m of typedMemories) {
    if ((m.supersedes || m.supersededBy) && !v.memoryVersion) return false;
    if (
      m.supersedes &&
      memories.has(m.supersedes) &&
      memories.get(m.supersedes)!.supersededBy !== m.id
    )
      return false;
    if (
      m.supersededBy &&
      memories.has(m.supersededBy) &&
      memories.get(m.supersededBy)!.supersedes !== m.id
    )
      return false;
    const seen = new Set<string>();
    let cursor: typeof m | undefined = m;
    while (cursor) {
      if (seen.has(cursor.id)) return false;
      seen.add(cursor.id);
      cursor = cursor.supersededBy
        ? memories.get(cursor.supersededBy)
        : undefined;
    }
  }
  return (
    new Set(v.memories.map((m) => m.id)).size === v.memories.length &&
    new Set(v.messages.map((m) => m.id)).size === v.messages.length
  );
}
export function canonicalWorkspace(w: Workspace): Workspace {
  // Copy only application fields; transient credentials can never enter saved state.
  return {
    ...(w.entity ? { entity: cleanEntity(w.entity) } : {}),
    ...(w.runs ? { runs: w.runs.map(cleanRun) } : {}),
    ...(w.memoryVersion !== undefined
      ? { memoryVersion: w.memoryVersion }
      : {}),
    profile: { name: w.profile.name, purpose: w.profile.purpose },
    selectedId: w.selectedId,
    experiments: w.experiments.map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      parentId: e.parentId,
      params: pickParams(e.params),
      color: e.color,
      createdAt: e.createdAt,
      ...(e.baseline
        ? {
            baseline: {
              title: e.baseline.title,
              kind: e.baseline.kind,
              params: pickParams(e.baseline.params),
              color: e.baseline.color,
            },
          }
        : {}),
    })),
    messages: w.messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      mode: m.mode,
      createdAt: m.createdAt,
      ...(m.memoryVersion !== undefined
        ? { memoryVersion: m.memoryVersion }
        : {}),
    })),
    memories: w.memories.map((m) => ({
      id: m.id,
      text: m.text,
      source: m.source,
      createdAt: m.createdAt,
      ...(m.pinned !== undefined ? { pinned: m.pinned } : {}),
      ...(m.supersedes ? { supersedes: m.supersedes } : {}),
      ...(m.supersededBy ? { supersededBy: m.supersededBy } : {}),
      ...(m.evidence
        ? {
            evidence: {
              experimentId: m.evidence.experimentId,
              title: m.evidence.title,
              params: pickParams(m.evidence.params),
              kind: m.evidence.kind,
              period: m.evidence.period,
              formula: m.evidence.formula,
            },
          }
        : {}),
    })),
  };
}
function pickParams(p: Workspace['experiments'][number]['params']) {
  return {
    length: p.length,
    gravity: p.gravity,
    amplitude: p.amplitude,
    damping: p.damping,
    mass: p.mass,
    stiffness: p.stiffness,
  };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const source = request.headers.get('sec-fetch-site');
  return (
    (!origin || origin === new URL(request.url).origin) &&
    (!source || source === 'same-origin' || source === 'none')
  );
}
export async function readBoundedJson(
  request: Request,
  max: number,
): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > max)
    throw new Error('Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body.');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error('Request is too large.');
    }
    parts.push(item.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    bytes.set(part, offset);
    offset += part.length;
  });
  return JSON.parse(new TextDecoder().decode(bytes));
}
