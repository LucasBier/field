import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ZURI_MEDIA } from '../lib/zuri-media';
import { loadZuriImage } from '../lib/zuri-media-server';
import { XClient, type XConfig } from '../lib/x-auth';
const config = {
  clientId: 'client',
  clientSecret: 'secret',
  ownerKey: 'a'.repeat(64),
  encryptionKey: 'b'.repeat(64),
  userId: '123',
  origin: 'https://field.example',
} satisfies XConfig;
await test('catalog loader binds every image to its reviewed digest and blocks changed bytes', async () => {
  for (const asset of ZURI_MEDIA) {
    const bytes = await readFile(
      new URL('../public' + asset.path, import.meta.url),
    );
    const transport: typeof fetch = async (url, init) => {
      assert.ok(url instanceof URL);
      assert.equal(url.href, config.origin + asset.path);
      assert.equal(init?.redirect, 'error');
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    };
    assert.equal(
      (await loadZuriImage(config.origin, asset.id, transport)).size,
      asset.bytes,
    );
    const altered = Uint8Array.from(bytes);
    altered[altered.length - 1] ^= 1;
    await assert.rejects(
      loadZuriImage(
        config.origin,
        asset.id,
        async () =>
          new Response(altered, { headers: { 'Content-Type': 'image/png' } }),
      ),
      /media_changed/,
    );
  }
  await assert.rejects(
    loadZuriImage(
      config.origin,
      'window-v1',
      async () =>
        new Response('html', { headers: { 'Content-Type': 'text/html' } }),
    ),
  );
});
await test('X image upload sends raw multipart bytes, preserves the media ID and never retries', async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(typeof url, 'string');
    if ((url as string).endsWith('/media/upload')) {
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get('media_category'), 'tweet_image');
      assert.equal(
        await (init.body.get('media') as Blob).text(),
        'png fixture',
      );
      return Response.json({ data: { id: '2345' } });
    }
    assert.ok(typeof init?.body === 'string');
    assert.deepEqual(JSON.parse(init.body), {
      text: 'A quiet frame.',
      media: { media_ids: ['2345'] },
    });
    return Response.json({ data: { id: '6789' } });
  };
  const client = new XClient(config, transport);
  const id = await client.uploadImage(
    'access',
    new Blob(['png fixture'], { type: 'image/png' }),
  );
  assert.equal(await client.post('access', 'A quiet frame.', [id]), '6789');
  assert.equal(calls, 2);
  let attempts = 0;
  const failing = new XClient(config, async () => {
    attempts++;
    return Response.json({
      data: { id: '2345', processing_info: { state: 'pending' } },
    });
  });
  await assert.rejects(
    failing.uploadImage('access', new Blob(['x'], { type: 'image/png' })),
  );
  assert.equal(attempts, 1);
  await assert.rejects(client.post('access', 'Bad media.', ['not-an-id']));
  assert.equal(calls, 2);
});
