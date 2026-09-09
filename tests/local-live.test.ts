import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventData } from '../lib/event-stream';
import { previewMemoryRepair, applyMemoryRepair } from '../lib/memory-repair';
import type { Workspace } from '../lib/field';

const url = process.env.FIELD_TEST_URL;
type Saved = { workspace: Workspace; revision: number; scope: string };
await test(
  'real local model recalls corrected memory, persists a plan and obeys zero-cost visitor limits',
  { skip: !url || process.env.FIELD_TEST_LOCAL_LIVE !== '1' },
  async (t) => {
    // Explicit opt-in only. The required cookie proves this is an isolated guest workspace.
    const start = await fetch(`${url}/api/workspace`),
      cookie = start.headers.get('set-cookie')?.split(';')[0];
    assert.ok(
      cookie,
      'Never run the live check against the personal compatibility workspace.',
    );
    let saved = (await start.json()) as Saved;
    const headers = {
      Cookie: cookie,
      Origin: url!,
      'Content-Type': 'application/json',
    };
    const read = async () => {
      const r = await fetch(`${url}/api/workspace`, { headers });
      assert.equal(r.status, 200);
      saved = (await r.json()) as Saved;
    };
    const put = async (workspace: Workspace) => {
      const r = await fetch(`${url}/api/workspace`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          workspace,
          revision: saved.revision,
          scope: saved.scope,
        }),
      });
      assert.equal(r.status, 200);
      await read();
    };
    const send = async (message: string, id = randomUUID()) => {
      const started = Date.now();
      const r = await fetch(`${url}/api/companion`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, message, revision: saved.revision }),
      });
      assert.equal(r.status, 200);
      const events: { type: string; code?: string; text?: string }[] = [];
      let firstText = 0;
      for await (const data of eventData(r.body!)) {
        const event = JSON.parse(data);
        events.push(event);
        if (event.type === 'text' && !firstText)
          firstText = Date.now() - started;
      }
      await read();
      t.diagnostic(
        JSON.stringify({
          scenario: message,
          firstTextMs: firstText,
          totalMs: Date.now() - started,
          result: events.at(-1),
          reply: saved.workspace.messages.at(-1)?.text,
          usage: saved.workspace.runs?.at(-1)?.usage,
        }),
      );
      return events;
    };
    const available = (await (
      await fetch(`${url}/api/companion`, { headers })
    ).json()) as { enabled: boolean; provider: string; remaining: number };
    assert.equal(available.enabled, true);
    assert.equal(available.provider, 'ollama');
    assert.equal(available.remaining, 3);
    saved.workspace.memories.push({
      id: 'live-preference',
      text: 'I prefer coffee as my warm drink.',
      source: 'user',
      createdAt: new Date().toISOString(),
      pinned: true,
    });
    await put(saved.workspace);
    const firstId = randomUUID(),
      firstMessage =
        'What warm drink do I prefer? Answer in one sentence without creating a plan.';
    assert.equal((await send(firstMessage, firstId)).at(-1)!.type, 'done');
    assert.match(saved.workspace.messages.at(-1)!.text, /coffee/i);
    assert.equal(saved.workspace.runs!.at(-1)!.provider, 'ollama');
    const review = previewMemoryRepair(
      saved.workspace,
      'live-preference',
      'I prefer tea now. Coffee is no longer my preferred drink.',
    );
    await put(
      applyMemoryRepair(
        saved.workspace,
        review,
        review.items.map((item) => ({ key: item.key, action: 'keep' })),
      ),
    );
    assert.equal(
      (
        await send(
          'Please create exactly one plan to make my preferred warm drink tonight.',
        )
      ).at(-1)!.type,
      'done',
    );
    assert.equal(saved.workspace.memoryVersion, 1);
    assert.equal(saved.workspace.entity!.tasks.length, 1);
    assert.match(saved.workspace.entity!.tasks[0].title, /tea/i);
    assert.doesNotMatch(saved.workspace.entity!.tasks[0].title, /coffee/i);
    saved.workspace.entity!.permissions.tasks = false;
    await put(saved.workspace);
    const third = await send('Please add another task to make tea.');
    assert.ok(
      third.at(-1)!.type === 'done' || third.at(-1)!.code === 'permission',
    );
    assert.equal(saved.workspace.entity!.tasks.length, 1);
    const replay = await fetch(`${url}/api/companion`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: firstId,
        message: firstMessage,
        revision: saved.revision,
      }),
    });
    assert.equal(
      ((await replay.json()) as { status: string }).status,
      'completed',
    );
    const status = (await (
      await fetch(`${url}/api/companion`, { headers })
    ).json()) as { remaining: number };
    assert.equal(status.remaining, 0);
    const limited = await fetch(`${url}/api/companion`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: randomUUID(),
        message: 'One more message',
        revision: saved.revision,
      }),
    });
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { code: string }).code, 'quota');
    const other = (await (await fetch(`${url}/api/workspace`)).json()) as Saved;
    assert.notEqual(other.scope, saved.scope);
    assert.equal(other.workspace.memories.length, 0);
    assert.equal(other.workspace.entity!.tasks.length, 0);
  },
);
