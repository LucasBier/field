export type DeskMode = 'virtual' | 'physical';
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_verification'
  | 'succeeded'
  | 'failed'
  | 'stopping'
  | 'stopped'
  | 'needs_attention';
export type Point = { x: number; y: number; z: number };
export type DeskObject = Point & { id: string; name: string; color: string };
export type DeskWorld = {
  objects: DeskObject[];
  gripper: Point & { holding: string | null };
  revision: number;
};
export type DeskObservation = {
  capturedAt: number;
  sequence: number;
  imageUrl?: string;
  recordingUrl?: string;
};
export type DeskEvent = {
  at: number;
  text: string;
  world?: DeskWorld;
  observation?: DeskObservation;
};
export type DeskTask = {
  id: string;
  instruction: string;
  objectId: string;
  status: TaskStatus;
  mode: DeskMode;
  stage: number;
  createdAt: number;
  updatedAt: number;
  events: DeskEvent[];
  lease?: string;
  leaseUntil?: number;
  lastSequence?: number;
  verdict?: 'geometry' | 'operator';
  mediaCount?: number;
  mediaBytes?: number;
};
export type DeskState = {
  version: 1;
  device: {
    mode: DeskMode;
    name: string;
    lastSeen: number;
    bridgeHash?: string;
  };
  world: DeskWorld;
  observation?: DeskObservation;
  tasks: DeskTask[];
};
export type DeskView = Omit<DeskState, 'device' | 'tasks'> & {
  device: Omit<DeskState['device'], 'bridgeHash'> & { online: boolean };
  tasks: Omit<DeskTask, 'lease'>[];
};
export const DESK_STAGES = [
  'Observe',
  'Approach',
  'Grasp',
  'Lift',
  'Place',
  'Verify',
];
export const TRAY = { x: 0.66, z: 0.15, width: 0.5, depth: 0.66 };
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    v,
  );
export class DeskError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function newDesk(): DeskState {
  return {
    version: 1,
    device: { mode: 'virtual', name: 'Field desk', lastSeen: 0 },
    world: {
      revision: 0,
      objects: [
        {
          id: 'green-cup',
          name: 'green cup',
          color: '#6a997b',
          x: -0.6,
          y: 0,
          z: 0.3,
        },
        {
          id: 'violet-cup',
          name: 'violet cup',
          color: '#8758d6',
          x: -0.1,
          y: 0,
          z: -0.28,
        },
        {
          id: 'coral-cup',
          name: 'coral cup',
          color: '#c57661',
          x: -0.62,
          y: 0,
          z: -0.3,
        },
      ],
      gripper: { x: 0, y: 0.7, z: -0.65, holding: null },
    },
    tasks: [],
  };
}
export const pending = (t: Pick<DeskTask, 'status'>) =>
  !['succeeded', 'failed', 'stopped'].includes(t.status);
export const activeTask = (s: DeskState) => s.tasks.find(pending);
export const online = (s: DeskState, now = Date.now()) =>
  s.device.mode === 'virtual' ||
  (!!s.device.bridgeHash && now - s.device.lastSeen < 15000);
export function publicDesk(s: DeskState, now = Date.now()): DeskView {
  const { bridgeHash: _secret, ...device } = s.device;
  return {
    ...s,
    device: { ...device, online: online(s, now) },
    tasks: s.tasks.map(({ lease: _lease, ...t }) => t),
  };
}
function record(s: DeskState, t: DeskTask, text: string, now: number) {
  t.updatedAt = now;
  // Keep the beginning and terminal evidence. Intermediate frames have a bounded budget.
  if (t.events.length >= 38) t.events.splice(1, 1);
  t.events.push({
    at: now,
    text,
    ...(t.mode === 'virtual' ? { world: structuredClone(s.world) } : {}),
    ...(s.observation && t.mode === 'physical'
      ? { observation: { ...s.observation } }
      : {}),
  });
}
export function parseDeskInstruction(
  text: string,
): { objectId: string; instruction: string } | null {
  const match = text
    .trim()
    .match(
      /^(?:zuri[,\s]+)?(?:please\s+)?(?:put|place|move)\s+(?:the\s+)?(green|violet|purple|coral)\s+cup\s+(?:on(?:to)?|in(?:to)?)\s+(?:the\s+)?tray[.!]?$/i,
    );
  if (!match) return null;
  const color =
    match[1].toLowerCase() === 'purple' ? 'violet' : match[1].toLowerCase();
  return {
    objectId: `${color}-cup`,
    instruction: `Put the ${color} cup on the tray.`,
  };
}
export function startDeskTask(
  s: DeskState,
  id: string,
  text: string,
  now: number,
) {
  if (!uuid(id) || text.length > 240)
    throw new DeskError('This desk request is invalid.', 400);
  const command = parseDeskInstruction(text);
  if (!command)
    throw new DeskError(
      'Try “Put the green cup on the tray.” Green, violet and coral cups are supported.',
      400,
    );
  const prior = s.tasks.find((t) => t.id === id);
  if (prior) {
    if (prior.instruction !== command.instruction)
      throw new DeskError('This request already belongs to another task.');
    return s;
  }
  if (activeTask(s))
    throw new DeskError('Finish or stop the current task first.');
  if (!online(s, now))
    throw new DeskError(
      'The desk is not connected. Reconnect it before sending a task.',
    );
  if (s.tasks.length >= 100)
    throw new DeskError(
      'This desk has reached its 100-task limit. Export its records before starting a new workspace.',
    );
  const task: DeskTask = {
    id,
    ...command,
    mode: s.device.mode,
    status: 'queued',
    stage: 0,
    createdAt: now,
    updatedAt: now,
    events: [],
  };
  s.tasks.push(task);
  record(s, task, 'Request accepted. Execution has not started.', now);
  return s;
}
export function inTray(object: DeskObject) {
  return (
    Math.abs(object.x - TRAY.x) <= TRAY.width / 2 - 0.09 &&
    Math.abs(object.z - TRAY.z) <= TRAY.depth / 2 - 0.09 &&
    Math.abs(object.y) < 0.005
  );
}
/** Advances only the explicitly virtual workspace. No hardware completion is inferred from elapsed time. */
export function advanceDesk(s: DeskState, now: number) {
  const task = activeTask(s);
  if (!task) return s;
  if (task.mode === 'physical') {
    const deadline = task.leaseUntil || task.createdAt + 30000;
    if (
      ['queued', 'running', 'stopping'].includes(task.status) &&
      now > deadline
    ) {
      task.status = 'needs_attention';
      record(
        s,
        task,
        'Connection or execution acknowledgement expired. Physical outcome is unknown; the task will not be replayed.',
        now,
      );
    }
    return s;
  }
  if (
    !['queued', 'running'].includes(task.status) ||
    now - task.updatedAt < 1100
  )
    return s;
  const object = s.world.objects.find((o) => o.id === task.objectId);
  if (!object) {
    task.status = 'failed';
    record(s, task, 'The requested object is no longer available.', now);
    return s;
  }
  const hand = s.world.gripper;
  task.status = 'running';
  const texts = [
    `Located the ${object.name} in the current desk state.`,
    'Approaching the object at its current position.',
    'Grasp established in the virtual workspace.',
    'Object lifted clear of the table.',
    'Object released over the tray.',
    'Verified: the object is inside the tray and the gripper is empty.',
  ];
  if (task.stage === 1) {
    hand.x = object.x;
    hand.z = object.z;
    hand.y = 0.42;
  }
  if (task.stage === 2) {
    // Re-observe before grasping; a changed layout must not reuse the previous coordinates.
    if (Math.hypot(hand.x - object.x, hand.z - object.z) > 0.02) {
      task.stage = 1;
      record(
        s,
        task,
        'The object moved. Re-observing its position before approaching again.',
        now,
      );
      return s;
    }
    hand.y = 0.16;
    hand.holding = object.id;
  }
  if (task.stage === 3) {
    hand.y = 0.6;
    object.y = 0.44;
  }
  if (task.stage === 4) {
    hand.x = TRAY.x;
    hand.z = TRAY.z;
    hand.y = 0.5;
    object.x = TRAY.x;
    object.z = TRAY.z;
    object.y = 0;
    hand.holding = null;
  }
  if (task.stage === 5) {
    task.status =
      inTray(object) && hand.holding === null ? 'succeeded' : 'failed';
    if (task.status === 'succeeded') task.verdict = 'geometry';
  }
  s.world.revision++;
  record(
    s,
    task,
    task.status === 'failed'
      ? 'Placement could not be verified.'
      : texts[task.stage],
    now,
  );
  task.stage++;
  return s;
}
export function rearrangeDesk(s: DeskState, now: number) {
  if (s.device.mode !== 'virtual')
    throw new DeskError('Rearrange the physical objects at the actual desk.');
  const t = activeTask(s);
  if (t && !['queued', 'running'].includes(t.status))
    throw new DeskError('Resolve the current task first.');
  const movable = s.world.objects.filter(
    (o) => o.id !== s.world.gripper.holding,
  );
  const positions = [
    { x: -0.6, z: -0.32 },
    { x: -0.08, z: 0.32 },
    { x: -0.62, z: 0.3 },
  ];
  movable.forEach((o, i) =>
    Object.assign(o, positions[(i + 1 + (s.world.revision % 3)) % 3], { y: 0 }),
  );
  s.world.revision++;
  if (t)
    record(
      s,
      t,
      'The desk layout changed. The next action will use the updated positions.',
      now,
    );
  return s;
}
export function stopDeskTask(s: DeskState, id: string, now: number) {
  const t = s.tasks.find((t) => t.id === id);
  if (!t) throw new DeskError('Task not found.', 404);
  if (!pending(t) || t.status === 'stopping') return s;
  if (t.mode === 'virtual') {
    const held = s.world.objects.find((o) => o.id === s.world.gripper.holding);
    if (held) held.y = 0;
    s.world.gripper.holding = null;
    t.status = 'stopped';
    record(
      s,
      t,
      'Stopped in the virtual workspace. Placement was not certified.',
      now,
    );
  } else {
    t.status = 'stopping';
    t.leaseUntil = now + 15000;
    record(
      s,
      t,
      'Stop requested. Waiting for the device to acknowledge; this is not an emergency stop.',
      now,
    );
  }
  return s;
}
export function reviewDeskTask(
  s: DeskState,
  id: string,
  accepted: boolean,
  now: number,
) {
  const t = s.tasks.find((t) => t.id === id);
  if (!t || t.mode !== 'physical' || t.status !== 'awaiting_verification')
    throw new DeskError('This task is not waiting for a placement review.');
  const evidence = t.events.at(-1)?.observation;
  if (!evidence?.imageUrl || now - evidence.capturedAt > 30000)
    throw new DeskError(
      'A fresh camera frame is required before reviewing placement.',
    );
  t.status = accepted ? 'succeeded' : 'failed';
  t.verdict = 'operator';
  record(
    s,
    t,
    accepted
      ? 'The operator confirmed placement from the camera evidence.'
      : 'The operator rejected the placement.',
    now,
  );
  return s;
}
export function httpsMedia(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  if (
    /^\/api\/desk\/media\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|webm|mp4)$/.test(
      value,
    )
  )
    return true;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function observation(value: unknown, now: number): DeskObservation {
  const v = value as DeskObservation;
  if (
    !v ||
    !Number.isSafeInteger(v.sequence) ||
    v.sequence < 0 ||
    !Number.isSafeInteger(v.capturedAt) ||
    v.capturedAt > now + 5000 ||
    now - v.capturedAt > 15000 ||
    (v.imageUrl !== undefined && !httpsMedia(v.imageUrl)) ||
    (v.recordingUrl !== undefined && !httpsMedia(v.recordingUrl))
  )
    throw new DeskError('Invalid or stale device observation.', 400);
  return {
    sequence: v.sequence,
    capturedAt: v.capturedAt,
    ...(v.imageUrl ? { imageUrl: v.imageUrl } : {}),
    ...(v.recordingUrl ? { recordingUrl: v.recordingUrl } : {}),
  };
}
export function pairDesk(s: DeskState, bridgeHash: string, _now: number) {
  if (activeTask(s))
    throw new DeskError(
      'Resolve the current task before changing the connected device.',
    );
  s.device = {
    mode: 'physical',
    name: 'Connected desk',
    lastSeen: 0,
    bridgeHash,
  };
  s.observation = undefined;
  return s;
}
export function switchToVirtualDesk(s: DeskState) {
  if (activeTask(s))
    throw new DeskError('Resolve the current task before changing workspaces.');
  s.device = { mode: 'virtual', name: 'Field desk', lastSeen: 0 };
  s.observation = undefined;
  return s;
}
/** At-most-once dispatch. A lost claim response cannot be retried as a new execution. */
export function claimDeskTask(s: DeskState, lease: string, now: number) {
  if (s.device.mode !== 'physical')
    throw new DeskError('This workspace has no physical device.', 403);
  s.device.lastSeen = now;
  const t = activeTask(s);
  if (t?.status !== 'queued') return s;
  t.status = 'running';
  t.lease = lease;
  t.leaseUntil = now + 20000;
  record(
    s,
    t,
    'The device accepted this task. Waiting for execution evidence.',
    now,
  );
  return s;
}
export function reportDeskTask(
  s: DeskState,
  input: {
    id: string;
    lease: string;
    status: string;
    text: string;
    observation?: unknown;
  },
  now: number,
) {
  const t = s.tasks.find((t) => t.id === input.id);
  if (!t || !t.lease || t.lease !== input.lease || t.mode !== 'physical')
    throw new DeskError('Execution lease does not match.', 403);
  if (!['running', 'stopping', 'awaiting_verification'].includes(t.status))
    throw new DeskError(
      'This execution is closed or requires manual recovery.',
    );
  if (
    !['running', 'awaiting_verification', 'failed', 'stopped'].includes(
      input.status,
    ) ||
    typeof input.text !== 'string' ||
    !input.text.trim() ||
    input.text.length > 300
  )
    throw new DeskError('Unsupported device report.', 400);
  if (t.status === 'stopping' && !['stopped', 'failed'].includes(input.status))
    throw new DeskError('A stop acknowledgement is required.');
  if (t.status === 'awaiting_verification' && input.status === 'running')
    throw new DeskError(
      'A completed execution cannot resume without a new task.',
    );
  const obs =
    input.observation === undefined
      ? undefined
      : observation(input.observation, now);
  if (obs && obs.sequence <= (t.lastSequence ?? -1))
    throw new DeskError('The observation has already been processed.');
  if (input.status === 'awaiting_verification' && !obs?.imageUrl)
    throw new DeskError('Camera evidence is required for placement review.');
  if (obs) {
    s.observation = obs;
    t.lastSequence = obs.sequence;
  }
  s.device.lastSeen = now;
  t.leaseUntil = now + 20000;
  t.status = input.status as TaskStatus;
  record(s, t, input.text.trim(), now);
  return s;
}
