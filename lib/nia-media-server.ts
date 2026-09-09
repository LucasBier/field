import { niaMedia, type NiaMediaId } from './nia-media';
import { XError } from './x-auth';

// Only immutable catalog assets from this deployment may be sent to X.
export async function loadNiaImage(
  origin: string,
  id: NiaMediaId,
  transport: typeof fetch = fetch,
) {
  const asset = niaMedia(id);
  if (!asset) throw new XError('invalid_media');
  const r = await transport(new URL(asset.path, origin), {
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok || !r.headers.get('content-type')?.startsWith('image/png'))
    throw new XError('media_unavailable', 502);
  const reader = r.body?.getReader();
  if (!reader) throw new XError('media_unavailable', 502);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > asset.bytes) throw new XError('media_changed', 409);
      chunks.push(new Uint8Array(value));
    }
  } finally {
    await reader.cancel();
  }
  const blob = new Blob(chunks, { type: 'image/png' });
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (size !== asset.bytes || hash !== asset.sha256)
    throw new XError('media_changed', 409);
  return blob;
}
