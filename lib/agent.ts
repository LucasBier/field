import {
  baselineOf,
  branchExperiment,
  createExperiment,
  formula,
  LIMITS,
  period,
  stamp,
  uid,
  validParams,
  type Kind,
  type Parameters,
  type Workspace,
} from './field';
import { activeMemories } from './memory';
export type Action = {
  type: 'update' | 'branch' | 'create';
  experimentId?: string;
  kind?: Kind;
  title?: string;
  params?: Partial<Parameters>;
};
export function validateActions(value: unknown): value is Action[] {
  if (!Array.isArray(value) || value.length > 3) return false;
  return value.every((a) => {
    if (
      !a ||
      typeof a !== 'object' ||
      !['update', 'branch', 'create'].includes(a.type) ||
      Object.keys(a).some(
        (k) => !['type', 'experimentId', 'kind', 'title', 'params'].includes(k),
      )
    )
      return false;
    if (
      a.type !== 'create' &&
      (typeof a.experimentId !== 'string' ||
        !a.experimentId ||
        a.experimentId.length > 80)
    )
      return false;
    if (a.type === 'create' && !['pendulum', 'spring'].includes(a.kind))
      return false;
    if (
      a.title !== undefined &&
      (typeof a.title !== 'string' || !a.title.trim() || a.title.length > 120)
    )
      return false;
    if (
      a.params !== undefined &&
      (!a.params ||
        typeof a.params !== 'object' ||
        Array.isArray(a.params) ||
        !Object.entries(a.params).every(
          ([k, v]) =>
            Object.hasOwn(LIMITS, k) &&
            typeof v === 'number' &&
            Number.isFinite(v) &&
            v >= LIMITS[k as keyof Parameters][0] &&
            v <= LIMITS[k as keyof Parameters][1],
        ))
    )
      return false;
    return true;
  });
}
export function applyActions(
  workspace: Workspace,
  actions: Action[],
): Workspace {
  if (!validateActions(actions))
    throw new Error(
      'The suggested experiment changes were invalid. Nothing was changed.',
    );
  const next = { ...workspace, experiments: [...workspace.experiments] };
  for (const action of actions) {
    const source = next.experiments.find((e) => e.id === action.experimentId);
    if (action.type !== 'create' && !source)
      throw new Error(
        'That experiment is no longer available. Nothing was changed.',
      );
    const e =
      action.type === 'create'
        ? createExperiment(action.kind!, next.experiments.length)
        : action.type === 'branch'
          ? branchExperiment(source!, next.experiments.length)
          : { ...source!, params: { ...source!.params } };
    e.params = { ...e.params, ...action.params };
    if (!validParams(e.params)) throw new Error('Unsupported parameters.');
    if (action.title) e.title = action.title;
    if (action.type === 'update')
      next.experiments = next.experiments.map((old) =>
        old.id === e.id ? e : old,
      );
    else next.experiments.push(e);
    next.selectedId = e.id;
  }
  if (next.experiments.length > 80)
    throw new Error(
      'This workspace supports 80 experiments. Export your work before starting a new workspace.',
    );
  return next;
}
export function demoReply(
  message: string,
  w: Workspace,
): { reply: string; workspace: Workspace } {
  const e = w.experiments.find((e) => e.id === w.selectedId)!;
  const q = message.toLowerCase().trim();
  if (/^remember\s*[: ,]/i.test(message)) {
    const content = message.replace(/^remember\s*[: ,]+/i, '').trim();
    if (!content)
      return {
        reply: 'Tell me what to remember after “Remember:”.',
        workspace: w,
      };
    if (w.memories.length >= 200)
      return {
        reply:
          'Your memory shelf is full. Export it or remove an older memory first.',
        workspace: w,
      };
    return {
      reply:
        'Kept as something you told me. You can inspect or remove it in Memory.',
      workspace: {
        ...w,
        memories: [
          ...w.memories,
          { id: uid(), text: content, source: 'user', createdAt: stamp() },
        ],
      },
    };
  }
  let actions: Action[] = [];
  if (/\b(build|create|new|make|add)\b/.test(q) && /\bspring\b/.test(q))
    actions = [{ type: 'create', kind: 'spring' }];
  else if (/\b(build|create|new|make|add)\b/.test(q) && /\bpendulum\b/.test(q))
    actions = [{ type: 'create', kind: 'pendulum' }];
  else if (/\bmoon\b/.test(q)) {
    if (e.kind !== 'pendulum')
      return {
        reply:
          'Gravity shifts a vertical spring’s equilibrium, but not its ideal period. Open a pendulum to compare Earth and Moon gravity.',
        workspace: w,
      };
    actions = [
      {
        type: 'branch',
        experimentId: e.id,
        params: { gravity: 1.62 },
        title: 'The pendulum · Moon gravity',
      },
    ];
  } else if (/\bearth\b/.test(q)) {
    if (e.kind !== 'pendulum')
      return {
        reply:
          'Earth gravity does not change this ideal spring period. Try changing its mass or stiffness.',
        workspace: w,
      };
    actions = [
      { type: 'update', experimentId: e.id, params: { gravity: 9.81 } },
    ];
  } else if (
    /\b(branch|compare|duplicate)\b/.test(q) &&
    !/\b(explain|why|difference|result)\b/.test(q)
  )
    actions = [{ type: 'branch', experimentId: e.id }];
  else {
    const match = q.match(
      /\b(length|gravity|mass|stiffness|amplitude)\s*(?:to|=|is|of|at)?\s*(-?\d+(?:\.\d+)?)/,
    );
    if (match) {
      const key = match[1] as keyof Parameters,
        value = Number(match[2]);
      const [min, max] = LIMITS[key];
      if (value < min || value > max)
        return {
          reply: `${key[0].toUpperCase() + key.slice(1)} must be between ${min} and ${max} in this model. Nothing changed.`,
          workspace: w,
        };
      if (
        (e.kind === 'spring' && ['length', 'gravity'].includes(key)) ||
        (e.kind === 'pendulum' && ['mass', 'stiffness'].includes(key))
      )
        return {
          reply:
            'That variable is not active in the selected experiment. Try the other experiment type.',
          workspace: w,
        };
      actions = [
        { type: 'update', experimentId: e.id, params: { [key]: value } },
      ];
    }
  }
  if (actions.length) {
    const next = applyActions(w, actions);
    const result = next.experiments.find((x) => x.id === next.selectedId)!;
    const ratio = period(result) / period(e);
    return {
      workspace: next,
      reply: `${actions[0].type === 'branch' ? 'I preserved the original and made a variation.' : actions[0].type === 'create' ? 'Your new experiment is ready.' : 'The experiment is updated.'} Its calculated period is ${period(result).toFixed(3)} s${actions[0].type === 'branch' ? ` — ${ratio.toFixed(2)}× the baseline` : ''}. Use “Keep finding” to save the result with its parameters.`,
    };
  }
  if (/\b(explain|why|period|difference|result|learn|happen)\b/.test(q)) {
    const parent = baselineOf(e);
    return {
      workspace: w,
      reply: `${formula(e.kind)}. ${e.kind === 'pendulum' ? 'Lengthening the pendulum slows its swing; stronger gravity speeds it up. Mass does not affect this ideal small-angle period.' : 'More mass slows the oscillation; a stiffer spring speeds it up.'} The calculated period is ${period(e).toFixed(3)} s.${parent ? ` This is ${(period(e) / period(parent)).toFixed(2)}× its frozen baseline period.` : ''} This is a mathematical prediction, not a sensor measurement.`,
    };
  }
  if (/\b(memory|remembered|know about me)\b/.test(q))
    return {
      workspace: w,
      reply: activeMemories(w.memories).length
        ? `Your latest memories:\n${activeMemories(w.memories)
            .slice(-5)
            .map(
              (m) =>
                `• [${m.source === 'user' ? 'You told me' : 'Calculated'}] ${m.text}`,
            )
            .join('\n')}`
        : 'No memories yet. Say “Remember: I prefer hands-on explanations” or use “Keep finding” on an experiment.',
    };
  return {
    workspace: w,
    reply:
      'The experiment controls accept commands such as “Try Moon gravity”, “Set length to 2”, “Build a spring”, “Explain the result”, and “Remember: …”. Connect a model for open-ended conversation.',
  };
}
