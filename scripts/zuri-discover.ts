import { discoverPublicSignals } from '../lib/zuri-discovery';

const endpoint = process.env.FIELD_ZURI_PUBLIC_FEED;
if (!endpoint)
  throw new Error(
    'Set FIELD_ZURI_PUBLIC_FEED to the local read-only public-post endpoint.',
  );
const url = new URL(endpoint);
if (
  url.protocol !== 'http:' ||
  url.hostname !== '127.0.0.1' ||
  url.username ||
  url.password
)
  throw new Error(
    'The public feed must use IPv4 loopback without credentials.',
  );
const r = await fetch(url, {
  redirect: 'error',
  signal: AbortSignal.timeout(10000),
});
if (!r.ok) throw new Error('Public feed unavailable.');
const reader = r.body?.getReader();
if (!reader) throw new Error('Public feed unavailable.');
const chunks: Uint8Array[] = [];
let bytes = 0;
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 5_000_000) throw new Error('Public feed too large.');
    chunks.push(value);
  }
} finally {
  await reader.cancel();
}
const signals = discoverPublicSignals(
  JSON.parse(Buffer.concat(chunks).toString('utf8')),
);
console.log(
  JSON.stringify({ checkedAt: new Date().toISOString(), signals }, null, 2),
);
