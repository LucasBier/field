import type { Entity } from './entity-schema';
import type { AgentRun } from './runtime-schema';
import { ZURI } from './companion-character';
export type Kind = 'pendulum' | 'spring';
export type Parameters = {
  length: number;
  gravity: number;
  amplitude: number;
  damping: number;
  mass: number;
  stiffness: number;
};
export type Experiment = {
  id: string;
  title: string;
  kind: Kind;
  parentId: string | null;
  params: Parameters;
  color: string;
  createdAt: string;
  baseline?: { title: string; kind: Kind; params: Parameters; color: string };
};
export type Memory = {
  id: string;
  text: string;
  source: 'user' | 'experiment';
  createdAt: string;
  pinned?: boolean;
  supersedes?: string;
  supersededBy?: string;
  evidence?: {
    experimentId: string;
    title: string;
    params: Parameters;
    kind: Kind;
    period: number;
    formula: string;
  };
};
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  mode: 'demo' | 'model';
  memoryVersion?: number;
};
export type Workspace = {
  entity?: Entity;
  runs?: AgentRun[];
  memoryVersion?: number;
  profile: { name: string; purpose: string };
  experiments: Experiment[];
  selectedId: string;
  memories: Memory[];
  messages: Message[];
};
export const DEFAULT_PARAMS: Parameters = {
  length: 1.5,
  gravity: 9.81,
  amplitude: 15,
  damping: 0,
  mass: 1,
  stiffness: 12,
};
export const COLORS = ['#baa8ff', '#83e3c7', '#ffbc87', '#8fcaff', '#f3a5c8'];
export const uid = () => crypto.randomUUID();
export const stamp = () => new Date().toISOString();
export const PREVIOUS_COMPANION_PURPOSE =
  'Be a warm, thoughtful female AI companion. Share everyday conversations, remember what matters, and make plans together. Be affectionate at my pace, with your own point of view.';
export const COMPANION_PURPOSE = ZURI.purpose;
export const LEGACY_PURPOSE =
  'Build tangible experiments. Keep evidence. Stay curious.';
export function createExperiment(
  kind: Kind = 'pendulum',
  index = 0,
): Experiment {
  return {
    id: uid(),
    title: kind === 'pendulum' ? 'The pendulum question' : 'Spring dynamics',
    kind,
    parentId: null,
    params: { ...DEFAULT_PARAMS },
    color: COLORS[index % COLORS.length],
    createdAt: stamp(),
  };
}
export function initialWorkspace(): Workspace {
  const first: Experiment = {
    id: 'first-pendulum',
    title: 'The pendulum question',
    kind: 'pendulum',
    parentId: null,
    params: { ...DEFAULT_PARAMS },
    color: COLORS[0],
    createdAt: '2026-09-09T00:00:00.000Z',
  };
  return {
    profile: {
      name: ZURI.name,
      purpose: COMPANION_PURPOSE,
    },
    experiments: [first],
    selectedId: first.id,
    memories: [],
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        text: ZURI.welcome,
        createdAt: first.createdAt,
        mode: 'demo',
      },
    ],
  };
}
export function period(e: Pick<Experiment, 'kind' | 'params'>) {
  return (
    2 *
    Math.PI *
    Math.sqrt(
      e.kind === 'pendulum'
        ? e.params.length / e.params.gravity
        : e.params.mass / e.params.stiffness,
    )
  );
}
export const formula = (kind: Kind) =>
  kind === 'pendulum' ? 'T = 2π √(L / g)' : 'T = 2π √(m / k)';
export function displacement(e: Experiment, time: number) {
  return (
    (e.kind === 'pendulum'
      ? (e.params.amplitude * Math.PI) / 180
      : e.params.amplitude / 100) *
    Math.cos((2 * Math.PI * time) / period(e)) *
    Math.exp((-e.params.damping * time) / 12)
  );
}
export function branchExperiment(e: Experiment, index: number): Experiment {
  return {
    ...e,
    id: uid(),
    title: `${e.title.replace(/ · Branch \d+$/, '')} · Branch ${index}`,
    parentId: e.id,
    params: { ...e.params },
    color: COLORS[index % COLORS.length],
    createdAt: stamp(),
    baseline: {
      title: e.title,
      kind: e.kind,
      params: { ...e.params },
      color: e.color,
    },
  };
}
export function evidenceMemory(e: Experiment): Memory {
  return {
    id: uid(),
    text: `${e.title}: the ideal ${e.kind} period is ${period(e).toFixed(3)} s. ${e.kind === 'pendulum' ? `Length ${e.params.length} m; gravity ${e.params.gravity} m/s².` : `Mass ${e.params.mass} kg; stiffness ${e.params.stiffness} N/m.`}`,
    source: 'experiment',
    createdAt: stamp(),
    evidence: {
      experimentId: e.id,
      title: e.title,
      params: { ...e.params },
      kind: e.kind,
      period: period(e),
      formula: formula(e.kind),
    },
  };
}
export const LIMITS: Record<keyof Parameters, [number, number]> = {
  length: [0.3, 2.6],
  gravity: [0.5, 20],
  amplitude: [1, 20],
  damping: [0, 0],
  mass: [0.2, 5],
  stiffness: [2, 40],
};
export function validParams(value: unknown): value is Parameters {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(LIMITS).every(([key, [min, max]]) => {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  });
}

export function baselineOf(e: Experiment): Experiment | undefined {
  return e.baseline
    ? {
        ...e.baseline,
        id: 'baseline-' + e.id,
        parentId: null,
        createdAt: e.createdAt,
      }
    : undefined;
}
