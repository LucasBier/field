import test from 'node:test';
import assert from 'node:assert/strict';
import { digestToken, resolveVisitor } from '../lib/visitor';
import type { Workspace } from '../lib/field';

await test('anonymous visitors get independent HTTP-only credentials and hashed workspace keys', async () => {
  const a = await resolveVisitor(
    new Request('https://field.example/api/workspace'),
    { create: true },
  );
  const b = await resolveVisitor(
    new Request('https://field.example/api/workspace'),
    { create: true },
  );
  assert.notEqual(a!.workspaceId, b!.workspaceId);
  assert.match(a!.cookie!, /^__Host-field_visitor=[a-f0-9]{64};/);
  assert.match(a!.cookie!, /HttpOnly; SameSite=Lax/);
  assert.match(a!.cookie!, /; Secure$/);
  assert.ok(!a!.cookie!.includes('Domain='));
  const token = a!.cookie!.split(';')[0].split('=')[1];
  assert.equal(a!.workspaceId, `guest:${await digestToken(token)}`);
  assert.ok(!a!.workspaceId.includes(token));
  const again = await resolveVisitor(
    new Request('https://field.example/api/workspace', {
      headers: { Cookie: a!.cookie!.split(';')[0] },
    }),
  );
  assert.equal(again!.workspaceId, a!.workspaceId);
  assert.equal(again!.cookie, undefined);
});

await test('missing, malformed and duplicate credentials cannot authorize a write', async () => {
  for (const cookie of [
    '',
    '__Host-field_visitor=workspace',
    '__Host-field_visitor=abc',
    `__Host-field_visitor=${'a'.repeat(64)}; __Host-field_visitor=${'b'.repeat(64)}`,
  ]) {
    assert.equal(
      await resolveVisitor(
        new Request('https://field.example/api/workspace', {
          headers: { Cookie: cookie },
        }),
      ),
      null,
    );
  }
  assert.equal(
    await resolveVisitor(new Request('http://public.example/api/workspace'), {
      create: true,
    }),
    null,
  );
});

await test('legacy personal data is accessible only through an explicit local development setting', async () => {
  const local = new Request('http://localhost:3001/api/workspace');
  const options = { create: true, development: true, localWorkspace: true };
  assert.equal(
    (await resolveVisitor(local, options))!.workspaceId,
    'workspace',
  );
  assert.notEqual(
    (await resolveVisitor(local, { ...options, development: false }))!
      .workspaceId,
    'workspace',
  );
  assert.notEqual(
    (await resolveVisitor(
      new Request('https://field.example/api/workspace'),
      options,
    ))!.workspaceId,
    'workspace',
  );
  assert.notEqual(
    (await resolveVisitor(local, { create: true }))!.workspaceId,
    'workspace',
  );
});

const url = process.env.FIELD_TEST_URL;
await test(
  'two anonymous browsers cannot read or overwrite each other’s D1 workspace',
  { skip: !url || process.env.FIELD_TEST_GUESTS !== '1' },
  async () => {
    async function start() {
      const r = await fetch(`${url}/api/workspace`);
      assert.equal(r.status, 200);
      const cookie = r.headers.get('set-cookie')?.split(';')[0];
      assert.ok(
        cookie,
        'Run this test only against guest mode in an isolated database.',
      );
      return {
        ...((await r.json()) as {
          workspace: Workspace;
          revision: number;
          scope: string;
          access: string;
        }),
        cookie,
      };
    }
    const a = await start(),
      b = await start();
    assert.equal(a.access, 'guest');
    assert.notEqual(a.scope, b.scope);
    assert.notEqual(a.workspace.entity!.id, b.workspace.entity!.id);
    a.workspace.profile.name = 'Private A';
    a.workspace.memories.push({
      id: 'private-a',
      text: 'Only browser A knows this detail.',
      source: 'user',
      createdAt: new Date().toISOString(),
    });
    async function put(
      cookie: string,
      scope: string,
      workspace: Workspace,
      revision: number,
    ) {
      return fetch(`${url}/api/workspace`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: url!,
          Cookie: cookie,
        },
        body: JSON.stringify({ scope, workspace, revision }),
      });
    }
    assert.equal(
      (await put(a.cookie, a.scope, a.workspace, a.revision)).status,
      200,
    );
    assert.equal(
      (await put(b.cookie, a.scope, a.workspace, a.revision)).status,
      403,
    );
    assert.equal((await put('', a.scope, a.workspace, a.revision)).status, 401);
    const readB = await fetch(
      `${url}/api/workspace?scope=${encodeURIComponent(a.scope)}`,
      { headers: { Cookie: b.cookie } },
    );
    const bSaved = (await readB.json()) as {
      workspace: Workspace;
      scope: string;
    };
    assert.equal(bSaved.scope, b.scope);
    assert.equal(bSaved.workspace.profile.name, 'Nia');
    assert.equal(bSaved.workspace.memories.length, 0);
    const readA = await fetch(`${url}/api/workspace`, {
      headers: { Cookie: a.cookie },
    });
    const aSaved = (await readA.json()) as { workspace: Workspace };
    assert.equal(aSaved.workspace.profile.name, 'Private A');
    assert.equal(
      aSaved.workspace.memories[0].text,
      'Only browser A knows this detail.',
    );
    assert.match(readA.headers.get('cache-control')!, /private, no-store/);
    assert.ok(
      (readA.headers.get('vary') || '')
        .split(',')
        .some((value) => value.trim().toLowerCase() === 'cookie'),
    );
    const newBrowser = await start();
    assert.equal(newBrowser.workspace.memories.length, 0);
  },
);
