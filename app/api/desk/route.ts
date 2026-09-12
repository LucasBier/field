import { deskStore } from '@/db/desk';
import { getVisitor } from '@/db/visitor';
import { digestToken, visitorHeaders, type Visitor } from '@/lib/visitor';
import { readBoundedJson, sameOrigin } from '@/lib/validation';
import {
  advanceDesk,
  DeskError,
  pairDesk,
  publicDesk,
  rearrangeDesk,
  reviewDeskTask,
  startDeskTask,
  stopDeskTask,
  switchToVirtualDesk,
} from '@/lib/desk';

const json = (data: unknown, status = 200, visitor?: Visitor) =>
  Response.json(data, { status, headers: visitorHeaders(visitor) });
const fail = (error: unknown) =>
  json(
    {
      error:
        error instanceof DeskError
          ? error.message
          : 'The desk could not be saved. Refresh its state before sending another request.',
    },
    error instanceof DeskError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : 503,
  );

export async function GET(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Open the desk from Field.' }, 403);
  try {
    const visitor = await getVisitor(request, true);
    if (!visitor) return json({ error: 'A secure session is required.' }, 401);
    const now = Date.now();
    const state = await deskStore().change(visitor.workspaceId, (s) =>
      advanceDesk(s, now),
    );
    return json(publicDesk(state, now), 200, visitor);
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Open the desk from Field.' }, 403);
  try {
    const visitor = await getVisitor(request);
    if (!visitor)
      return json({ error: 'Open your desk before changing it.' }, 401);
    const body = (await readBoundedJson(request, 4096)) as Record<
      string,
      unknown
    >;
    if (!body || typeof body.action !== 'string')
      throw new DeskError('Invalid desk request.', 400);
    const now = Date.now();
    let key: string | undefined, hash: string | undefined;
    if (body.action === 'pair') {
      key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      hash = await digestToken(key);
    }
    const state = await deskStore().change(visitor.workspaceId, (s) => {
      advanceDesk(s, now);
      if (
        body.action === 'start' &&
        typeof body.id === 'string' &&
        typeof body.instruction === 'string'
      )
        return startDeskTask(s, body.id, body.instruction, now);
      if (body.action === 'rearrange') return rearrangeDesk(s, now);
      if (body.action === 'stop' && typeof body.id === 'string')
        return stopDeskTask(s, body.id, now);
      if (
        body.action === 'review' &&
        typeof body.id === 'string' &&
        typeof body.accepted === 'boolean'
      )
        return reviewDeskTask(s, body.id, body.accepted, now);
      if (body.action === 'pair' && hash) return pairDesk(s, hash, now);
      if (body.action === 'virtual') return switchToVirtualDesk(s);
      if (
        body.action === 'resolve' &&
        typeof body.id === 'string' &&
        body.deviceStopped === true
      ) {
        const t = s.tasks.find((t) => t.id === body.id);
        if (!t || !['needs_attention', 'stopping'].includes(t.status))
          throw new DeskError('This task does not need manual recovery.');
        t.status = 'stopped';
        t.updatedAt = now;
        t.events.push({
          at: now,
          text: 'The operator confirmed the device is stopped. Outcome remains unverified.',
        });
        return s;
      }
      throw new DeskError('Unsupported desk request.', 400);
    });
    return json({
      desk: publicDesk(state, now),
      ...(key ? { pairingKey: key } : {}),
    });
  } catch (e) {
    return fail(e);
  }
}
