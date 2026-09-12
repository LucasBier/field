import { deskStore } from '@/db/desk';
import { validateStoredObservation } from '@/db/desk-media';
import { digestToken } from '@/lib/visitor';
import { readBoundedJson } from '@/lib/validation';
import {
  activeTask,
  advanceDesk,
  claimDeskTask,
  DeskError,
  reportDeskTask,
} from '@/lib/desk';

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  try {
    const key = request.headers
      .get('authorization')
      ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!key) return json({ error: 'Invalid bridge credential.' }, 401);
    const store = deskStore(),
      hash = await digestToken(key);
    const owner = await store.findBridge(hash);
    if (!owner) return json({ error: 'This bridge is disconnected.' }, 401);
    const body = (await readBoundedJson(request, 6500)) as Record<
      string,
      unknown
    >;
    if (body?.action === 'report' && typeof body.id === 'string')
      await validateStoredObservation(
        owner.workspace_id,
        body.id,
        body.observation,
      );
    const now = Date.now(),
      lease = crypto.randomUUID();
    let claimId: string | undefined;
    const state = await store.change(owner.workspace_id, (s) => {
      claimId = undefined;
      if (s.device.bridgeHash !== hash)
        throw new DeskError('This bridge was replaced.', 401);
      advanceDesk(s, now);
      if (body?.action === 'claim') {
        const prior = activeTask(s);
        if (prior?.status === 'queued') claimId = prior.id;
        return claimDeskTask(s, lease, now);
      }
      if (body?.action === 'heartbeat') {
        s.device.lastSeen = now;
        return s;
      }
      if (
        body?.action === 'report' &&
        typeof body.id === 'string' &&
        typeof body.lease === 'string' &&
        typeof body.status === 'string' &&
        typeof body.text === 'string'
      )
        return reportDeskTask(
          s,
          {
            id: body.id,
            lease: body.lease,
            status: body.status,
            text: body.text,
            observation: body.observation,
          },
          now,
        );
      throw new DeskError('Unsupported bridge request.', 400);
    });
    const active = activeTask(state);
    const claimed = claimId
      ? state.tasks.find((t) => t.id === claimId)
      : undefined;
    return json({
      task: claimed
        ? {
            id: claimed.id,
            instruction: claimed.instruction,
            lease: claimed.lease,
          }
        : null,
      active: active ? { id: active.id, status: active.status } : null,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof DeskError
            ? e.message
            : 'The bridge request could not be confirmed. Stop locally and reconcile before another execution.',
      },
      e instanceof DeskError ? e.status : e instanceof SyntaxError ? 400 : 503,
    );
  }
}
