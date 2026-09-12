import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { DeskView } from '../lib/desk';

const base = process.env.FIELD_TEST_URL;
await test(
  'desk HTTP lifecycle isolates visitors, fences claims and keeps stored evidence private',
  { skip: !base || process.env.FIELD_TEST_GUESTS !== '1' },
  async () => {
    async function visitor() {
      const r = await fetch(`${base}/api/desk`);
      assert.equal(r.status, 200);
      const cookie = r.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      return cookie;
    }
    const a = await visitor(),
      b = await visitor();
    const headers = (cookie: string) => ({
      Cookie: cookie,
      Origin: base!,
      'Content-Type': 'application/json',
    });
    const mutate = (cookie: string, body: unknown) =>
      fetch(`${base}/api/desk`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify(body),
      });
    const state = async (cookie: string) => {
      const r = await fetch(`${base}/api/desk`, {
        headers: { Cookie: cookie },
      });
      assert.equal(r.status, 200);
      return (await r.json()) as DeskView;
    };
    const id = randomUUID(),
      command = {
        action: 'start',
        id,
        instruction: 'Zuri, put the green cup on the tray.',
      };
    assert.equal((await mutate(a, command)).status, 200);
    assert.equal((await mutate(a, command)).status, 200);
    assert.equal((await state(a)).tasks.length, 1);
    assert.equal((await state(b)).tasks.length, 0);
    assert.equal((await mutate(b, { action: 'stop', id })).status, 404);
    assert.equal((await mutate(a, { action: 'rearrange' })).status, 200);
    for (let i = 0; i < 7; i++) {
      await delay(1150);
      await state(a);
    }
    assert.equal((await state(a)).tasks[0].status, 'succeeded');
    const pair = await mutate(a, { action: 'pair' });
    assert.equal(pair.status, 200);
    const { pairingKey } = (await pair.json()) as { pairingKey: string };
    assert.match(pairingKey, /^[a-f0-9]{64}$/);
    const bridge = (body: unknown, key = pairingKey) =>
      fetch(`${base}/api/desk/bridge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    assert.equal((await bridge({ action: 'heartbeat' })).status, 200);
    const physicalId = randomUUID();
    assert.equal((await mutate(a, { ...command, id: physicalId })).status, 200);
    const claims = await Promise.all(
      [1, 2].map(async () => {
        const r = await bridge({ action: 'claim' });
        assert.equal(r.status, 200);
        return (await r.json()) as {
          task: { id: string; lease: string } | null;
        };
      }),
    );
    assert.equal(claims.filter((c) => c.task).length, 1);
    const task = claims.find((c) => c.task)!.task!;
    const report = {
      action: 'report',
      id: physicalId,
      lease: task.lease,
      status: 'succeeded',
      text: 'Done',
    };
    assert.equal((await bridge(report)).status, 400);
    assert.equal(
      (await mutate(a, { action: 'review', id: physicalId, accepted: true }))
        .status,
      409,
    );
    const capturedAt = Date.now();
    const bytes = new Uint8Array([
      255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 255, 217,
    ]);
    const upload = await fetch(`${base}/api/desk/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pairingKey}`,
        'Content-Type': 'image/jpeg',
        'X-Task-Id': physicalId,
        'X-Execution-Lease': task.lease,
        'X-Captured-At': String(capturedAt),
      },
      body: bytes,
    });
    assert.equal(upload.status, 200, await upload.clone().text());
    const evidence = (await upload.json()) as {
      imageUrl: string;
      capturedAt: number;
      sequence: number;
    };
    const image = await fetch(`${base}${evidence.imageUrl}`, {
      headers: { Cookie: a },
    });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
    assert.equal(
      (await fetch(`${base}${evidence.imageUrl}`, { headers: { Cookie: b } }))
        .status,
      404,
    );
    assert.equal((await fetch(`${base}${evidence.imageUrl}`)).status, 404);
    assert.equal(
      (
        await bridge({
          ...report,
          status: 'awaiting_verification',
          observation: { ...evidence, capturedAt: capturedAt + 1 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await bridge({
          ...report,
          status: 'awaiting_verification',
          observation: evidence,
        })
      ).status,
      200,
    );
    assert.equal(
      (await mutate(a, { action: 'review', id: physicalId, accepted: true }))
        .status,
      200,
    );
    const completed = await state(a);
    assert.equal(completed.tasks.at(-1)!.status, 'succeeded');
    assert.equal(completed.tasks.at(-1)!.verdict, 'operator');
    assert.ok(!JSON.stringify(completed).includes(task.lease));
    assert.ok(!JSON.stringify(completed).includes(pairingKey));
    assert.equal((await mutate(a, { action: 'virtual' })).status, 200);
    assert.equal((await bridge({ action: 'heartbeat' })).status, 401);
    assert.equal(
      (
        await fetch(`${base}/api/desk`, {
          method: 'POST',
          headers: { ...headers(a), Origin: 'https://elsewhere.example' },
          body: JSON.stringify(command),
        })
      ).status,
      403,
    );
  },
);
