/** Bounded SSE decoding shared by the upstream adapter and browser client. */
export async function* eventData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  let pending = '',
    data: string[] = [],
    bytes = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1_000_000) throw new Error('Stream exceeds its limit.');
      pending += decoder.decode(chunk.value, { stream: true });
      let end: number;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).replace(/\r$/, '');
        pending = pending.slice(end + 1);
        if (!line) {
          if (data.length) {
            yield data.join('\n');
            data = [];
          }
        } else if (line.startsWith('data:'))
          data.push(line.slice(5).replace(/^ /, ''));
      }
    }
    signal?.throwIfAborted();
    pending += decoder.decode();
    if (pending.trim() || data.length)
      throw new Error('Stream ended between events.');
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Only a leading top-level reply string can appear as provisional speech. */
export function partialReply(raw: string): string {
  const start = /^\s*\{\s*"reply"\s*:\s*"/.exec(raw);
  if (!start) return '';
  let result = '';
  for (let i = start[0].length; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') return result;
    if (char !== '\\') {
      if (char.charCodeAt(0) < 32) return result;
      result += char;
      continue;
    }
    const escape = raw[++i];
    if (!escape) break;
    if (escape === 'u') {
      const hex = raw.slice(i + 1, i + 5);
      if (!/^[a-fA-F0-9]{4}$/.test(hex)) break;
      result += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      const escapes: Record<string, string> = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
      };
      if (!(escape in escapes)) break;
      result += escapes[escape];
    }
  }
  return result.replace(/[\uD800-\uDBFF]$/, '');
}
