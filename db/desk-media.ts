import { env } from 'cloudflare:workers';
import { deskStore } from './desk';
import { digestToken } from '../lib/visitor';
import { DeskError, uuid } from '../lib/desk';

export function deskMedia() {
  const bucket = (env as unknown as { DESK_MEDIA?: R2Bucket }).DESK_MEDIA;
  if (!bucket || typeof bucket.put !== 'function')
    throw new DeskError('Camera storage is unavailable.', 503);
  return bucket;
}
export async function bridgeOwner(request: Request) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new DeskError('Invalid bridge credential.', 401);
  const hash = await digestToken(token),
    store = deskStore();
  const owner = await store.findBridge(hash);
  if (!owner) throw new DeskError('This bridge is disconnected.', 401);
  return { hash, store, scope: owner.workspace_id };
}
export function mediaPath(path: string) {
  const m = path.match(
    /^\/api\/desk\/media\/([^/]+)\/([^/]+)\.(jpg|webm|mp4)$/,
  );
  return m && uuid(m[1]) && uuid(m[2]) ? `${m[1]}/${m[2]}.${m[3]}` : null;
}
export async function validateStoredObservation(
  scope: string,
  task: string,
  value: unknown,
) {
  if (!value || typeof value !== 'object') return;
  const v = value as {
    imageUrl?: string;
    recordingUrl?: string;
    capturedAt?: number;
  };
  for (const url of [v.imageUrl, v.recordingUrl]) {
    if (typeof url !== 'string' || !url.startsWith('/')) continue;
    const path = mediaPath(url);
    if (!path || !path.startsWith(task + '/'))
      throw new DeskError('Evidence does not belong to this task.', 400);
    const blob = await deskMedia().head(`${scope}/${path}`);
    if (
      !blob ||
      (url === v.imageUrl &&
        Number(blob.customMetadata?.capturedAt) !== v.capturedAt)
    )
      throw new DeskError(
        'Camera evidence was not stored or its capture time changed.',
        400,
      );
  }
}
