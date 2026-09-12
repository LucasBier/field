import { bridgeOwner, deskMedia } from '@/db/desk-media';
import { advanceDesk, DeskError, uuid } from '@/lib/desk';

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  try {
    const { hash, store, scope } = await bridgeOwner(request);
    const id = request.headers.get('x-task-id'),
      lease = request.headers.get('x-execution-lease');
    const capturedAt = Number(request.headers.get('x-captured-at'));
    const type = request.headers.get('content-type');
    const video = type === 'video/webm' || type === 'video/mp4';
    if (
      !uuid(id) ||
      !uuid(lease) ||
      (!video && type !== 'image/jpeg') ||
      !Number.isSafeInteger(capturedAt) ||
      capturedAt > Date.now() + 5000 ||
      Date.now() - capturedAt > 15000
    )
      throw new DeskError('Invalid camera upload.', 400);
    const limit = video ? 4 * 1024 * 1024 : 256 * 1024;
    if (!request.body || Number(request.headers.get('content-length')) > limit)
      throw new DeskError('Camera upload is too large.', 413);
    const bucket = deskMedia();
    const reader = request.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new DeskError('Camera upload is too large.', 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const signature =
      type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : type === 'video/webm'
          ? bytes[0] === 26 &&
            bytes[1] === 69 &&
            bytes[2] === 223 &&
            bytes[3] === 163
          : String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
    if (!signature) throw new DeskError('Unsupported media contents.', 400);
    const state = await store.change(scope, (s) => {
      advanceDesk(s, Date.now());
      const t = s.tasks.find((t) => t.id === id);
      if (
        s.device.bridgeHash !== hash ||
        !t ||
        t.lease !== lease ||
        !['running', 'awaiting_verification'].includes(t.status)
      )
        throw new DeskError('This execution cannot upload evidence.', 409);
      if (
        (t.mediaCount ?? 0) >= 120 ||
        (t.mediaBytes ?? 0) + size > 40 * 1024 * 1024
      )
        throw new DeskError('This task has reached its media allowance.', 413);
      t.mediaCount = (t.mediaCount ?? 0) + 1;
      t.mediaBytes = (t.mediaBytes ?? 0) + size;
      return s;
    });
    const ext = video ? (type === 'video/mp4' ? 'mp4' : 'webm') : 'jpg';
    const path = `${id}/${crypto.randomUUID()}.${ext}`;
    await bucket.put(`${scope}/${path}`, bytes, {
      httpMetadata: { contentType: type! },
      customMetadata: { capturedAt: String(capturedAt) },
    });
    const url = `/api/desk/media/${path}`;
    return json({
      sequence: state.tasks.find((t) => t.id === id)!.mediaCount,
      capturedAt,
      ...(video ? { recordingUrl: url } : { imageUrl: url }),
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof DeskError
            ? e.message
            : 'Camera evidence could not be stored.',
      },
      e instanceof DeskError ? e.status : 503,
    );
  }
}
