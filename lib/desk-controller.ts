export type BridgeReply = {
  task: { id: string; instruction: string; lease: string } | null;
  active: { id: string; status: string } | null;
};
export type OperatorState = {
  mode: string;
  busy: boolean;
  pending_once: number;
  cycle: number;
  dry_run: boolean;
  last_error?: string | null;
  events: { cycle?: number; outcome?: string }[];
};
export type BridgeIO = {
  field(body: Record<string, unknown>): Promise<BridgeReply>;
  operator(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<OperatorState>;
  capture(
    task: NonNullable<BridgeReply['task']>,
  ): Promise<{ sequence: number; capturedAt: number; imageUrl: string }>;
  checkpoint(task: NonNullable<BridgeReply['task']> | null): Promise<void>;
  wait(ms: number): Promise<void>;
  now(): number;
};

/** One bounded command at a time. External dispatches are never retried. */
export async function executeDeskTask(
  io: BridgeIO,
  task: NonNullable<BridgeReply['task']>,
) {
  await io.checkpoint(task);
  let acknowledged = false;
  let paused = false;
  const report = (status: string, text: string, observation?: unknown) =>
    io.field({
      action: 'report',
      id: task.id,
      lease: task.lease,
      status,
      text,
      ...(observation ? { observation } : {}),
    });
  async function pause() {
    await io.operator('/api/pause', {});
    for (let i = 0; i < 30; i++) {
      const s = await io.operator('/api/status');
      if (!s.busy && s.pending_once === 0 && s.mode === 'paused') {
        paused = true;
        return;
      }
      await io.wait(1000);
    }
    throw new Error(
      'The local controller has not acknowledged pause. Check the hardware.',
    );
  }
  async function current() {
    const r = await io.field({ action: 'heartbeat' });
    if (!r.active || r.active.id !== task.id) return false;
    if (r.active.status === 'stopping') {
      await pause();
      await report(
        'stopped',
        'The controller acknowledged pause. Any physical motion must be checked at the desk.',
      );
      return false;
    }
    if (!['running', 'awaiting_verification'].includes(r.active.status))
      throw new Error('The task requires local recovery.');
    return true;
  }
  try {
    const initial = await io.operator('/api/status');
    if (
      initial.dry_run !== false ||
      initial.busy ||
      initial.mode !== 'paused' ||
      initial.pending_once !== 0
    )
      throw new Error(
        'Start with an idle, paused controller configured for this physical desk.',
      );
    await io.operator('/api/task', { task: task.instruction });
    await io.operator('/api/record/start', {});
    let frame = await io.capture(task);
    await report(
      'running',
      'The camera is connected. Beginning one observed action at a time.',
      frame,
    );
    const deadline = io.now() + 240000;
    for (let step = 0; step < 40 && io.now() < deadline; step++) {
      if (!(await current())) {
        acknowledged = true;
        return;
      }
      const before = await io.operator('/api/status');
      if (before.busy || before.pending_once || before.mode !== 'paused')
        throw new Error('Unexpected controller activity.');
      paused = false;
      await io.operator('/api/step', {});
      let after: OperatorState | undefined;
      while (io.now() < deadline) {
        await io.wait(1500);
        if (!(await current())) {
          acknowledged = true;
          return;
        }
        const s = await io.operator('/api/status');
        if (s.last_error)
          throw new Error('The controller reported an execution error.');
        if (!s.busy && s.pending_once === 0 && s.cycle > before.cycle) {
          after = s;
          break;
        }
        await report(
          'running',
          'The controller is evaluating the current camera observation.',
        );
      }
      if (!after) throw new Error('The task exceeded its execution window.');
      frame = await io.capture(task);
      const outcome = after.events.find(
        (e) => e.cycle === after.cycle,
      )?.outcome;
      if (outcome === 'saved' || outcome === 'complete_not_saved') {
        await pause();
        await report(
          'awaiting_verification',
          'Execution ended. Review the camera frame to confirm the object is on the tray.',
          frame,
        );
        const reviewUntil = io.now() + 60000;
        while (io.now() < reviewUntil) {
          await io.wait(4000);
          if (!(await current())) {
            acknowledged = true;
            return;
          }
          frame = await io.capture(task);
          await report(
            'awaiting_verification',
            'Placement is waiting for your review.',
            frame,
          );
        }
        await report(
          'failed',
          'The review window ended without confirmation. Placement remains unverified.',
        );
        acknowledged = true;
        return;
      }
      if (outcome !== 'executed')
        throw new Error('The controller paused or rejected the next movement.');
      await report(
        'running',
        'The controller executed one movement. Observing the desk again.',
        frame,
      );
    }
    throw new Error('The bounded execution limit was reached.');
  } finally {
    // A disconnect must not leave continuous control running. Failure keeps the journal for recovery.
    if (!paused) await pause();
    if (acknowledged) await io.checkpoint(null);
  }
}
