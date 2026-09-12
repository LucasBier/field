import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  executeDeskTask,
  type BridgeIO,
  type BridgeReply,
  type OperatorState,
} from '../lib/desk-controller';

const root = new URL(process.env.FIELD_DESK_URL || 'http://localhost:3001');
const operator = new URL(
  process.env.FIELD_DESK_OPERATOR || 'http://127.0.0.1:8090',
);
const key = process.env.FIELD_DESK_KEY || '';
const view = process.env.FIELD_DESK_CAMERA || 'agentview';
const local = (url: URL) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
if (
  (!local(root) && root.protocol !== 'https:') ||
  root.username ||
  root.password
)
  throw new Error('Use HTTPS for Field or a loopback development origin.');
if (
  !local(operator) ||
  operator.protocol !== 'http:' ||
  operator.username ||
  operator.password
)
  throw new Error('Keep the operator on loopback on the device computer.');
if (!/^[a-f0-9]{64}$/.test(key) || !/^[a-zA-Z0-9_-]{1,40}$/.test(view))
  throw new Error('Set FIELD_DESK_KEY and a valid FIELD_DESK_CAMERA.');
const directory = join(homedir(), '.field'),
  journal = join(directory, 'desk-execution.json');
await mkdir(directory, { recursive: true, mode: 0o700 });
let shutdown = false;
process.once('SIGINT', () => {
  shutdown = true;
});
process.once('SIGTERM', () => {
  shutdown = true;
});
async function decoded<T>(r: Response): Promise<T> {
  if (!r.ok)
    throw new Error(
      `Service request failed (${r.status}). Reconcile locally before resuming.`,
    );
  return (await r.json()) as T;
}
const io: BridgeIO = {
  now: Date.now,
  wait: async (ms) => {
    await delay(ms);
    if (shutdown) throw new Error('Local stop requested.');
  },
  checkpoint: async (task) => {
    if (!task) {
      await rm(journal, { force: true });
      return;
    }
    await writeFile(
      journal + '.next',
      JSON.stringify({
        ...task,
        field: root.origin,
        recordedAt: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
    await rename(journal + '.next', journal);
  },
  field: async (body) =>
    decoded<BridgeReply>(
      await fetch(new URL('/api/desk/bridge', root), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(7000),
        redirect: 'error',
      }),
    ),
  operator: async (path, body) => {
    const r = await fetch(new URL(path, operator), {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(7000),
      redirect: 'error',
    });
    const v = await decoded<
      OperatorState & { ok?: boolean; operator?: OperatorState }
    >(r);
    if (v.ok === false)
      throw new Error('The local controller rejected a command.');
    return v.operator || v;
  },
  capture: async (task) => {
    const capturedAt = Date.now();
    const camera = await fetch(new URL(`/api/live/${view}`, operator), {
      signal: AbortSignal.timeout(6000),
      redirect: 'error',
    });
    if (!camera.ok) throw new Error('The camera is unavailable.');
    const bytes = await camera.arrayBuffer();
    if (bytes.byteLength > 256 * 1024)
      throw new Error(
        'Configure the camera preview below 256 KiB per JPEG frame.',
      );
    return decoded(
      await fetch(new URL('/api/desk/media', root), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'image/jpeg',
          'X-Task-Id': task.id,
          'X-Execution-Lease': task.lease,
          'X-Captured-At': String(capturedAt),
        },
        body: bytes,
        signal: AbortSignal.timeout(6000),
        redirect: 'error',
      }),
    );
  },
};
let prior: string | undefined;
try {
  prior = await readFile(journal, 'utf8');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
if (prior) {
  if (!process.argv.includes('--acknowledge-stopped'))
    throw new Error(
      'A previous execution needs review. Stop the hardware, resolve it in Field, then use --acknowledge-stopped.',
    );
  const state = await io.operator('/api/status'),
    remote = await io.field({ action: 'heartbeat' });
  if (
    state.busy ||
    state.pending_once ||
    state.mode !== 'paused' ||
    remote.active
  )
    throw new Error(
      'Both Field and the local controller must be reconciled first.',
    );
  await io.checkpoint(null);
}
if (!process.argv.includes('--arm')) {
  await io.operator('/api/status');
  console.log(
    'Connection checked. Use --arm at the physical desk to accept tasks.',
  );
} else {
  console.log(
    'Field desk bridge ready. Keep the physical stop control within reach.',
  );
  try {
    while (!shutdown) {
      const result = await io.field({ action: 'claim' });
      if (result.task) await executeDeskTask(io, result.task);
      else if (result.active && result.active.status !== 'queued')
        throw new Error('An existing execution needs reconciliation.');
      await delay(1500);
    }
  } catch (e) {
    // Do not clear the journal or replay a potentially dispatched command.
    try {
      await io.operator('/api/pause', {});
    } catch {
      /* The local physical stop remains authoritative. */
    }
    console.error(
      e instanceof Error
        ? e.message
        : 'Bridge stopped. Inspect the physical desk.',
    );
    process.exitCode = 1;
  }
}
