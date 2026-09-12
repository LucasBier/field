import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ZURI_MODEL } from '../lib/companion-model';

await test('the published character matches the reviewed asset and embeds its skeleton, motion and PBR textures', async () => {
  const bytes = await readFile(`public${ZURI_MODEL.src}`);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const manifest = JSON.parse(
    await readFile('public/characters/zuri-v2.json', 'utf8'),
  );
  assert.equal(header.getUint32(0, true), 0x46546c67);
  assert.equal(header.getUint32(4, true), 2);
  assert.equal(header.getUint32(8, true), bytes.length);
  assert.equal(header.getUint32(16, true), 0x4e4f534a);
  assert.equal(bytes.length, manifest.bytes);
  assert.ok(bytes.length < 6_000_000, 'Character download exceeds 6 MB.');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    manifest.sha256,
  );
  assert.equal(manifest.heightMeters, ZURI_MODEL.height);

  const document = JSON.parse(
    bytes.subarray(20, 20 + header.getUint32(12, true)).toString(),
  );
  assert.equal(document.asset.version, '2.0');
  assert.equal(document.skins.length, 1);
  assert.ok(document.skins[0].joints.length >= 20);
  assert.deepEqual(
    document.animations.map((clip: { name: string }) => clip.name).sort(),
    Object.values(ZURI_MODEL.clips).sort(),
  );
  for (const clip of document.animations) {
    assert.ok(clip.channels.length > 20, `${clip.name} has no body motion.`);
    for (const channel of clip.channels) {
      assert.ok(document.nodes[channel.target.node]);
      assert.ok(clip.samplers[channel.sampler]);
    }
  }
  for (const buffer of document.buffers) assert.equal(buffer.uri, undefined);
  for (const image of document.images) {
    assert.equal(image.uri, undefined);
    assert.equal(image.mimeType, 'image/webp');
    assert.ok(document.bufferViews[image.bufferView]);
  }
  for (const material of document.materials) {
    const pbr = material.pbrMetallicRoughness;
    // Rigging exports can silently drop these maps while preserving the color.
    for (const slot of [
      pbr.baseColorTexture,
      pbr.metallicRoughnessTexture,
      material.normalTexture,
      material.emissiveTexture,
    ]) {
      assert.ok(slot, 'The rigged asset lost an authored material map.');
      const texture = document.textures[slot.index];
      assert.ok(document.images[texture.extensions.EXT_texture_webp.source]);
    }
  }
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      assert.ok(document.accessors[primitive.attributes.JOINTS_0]);
      assert.ok(document.accessors[primitive.attributes.WEIGHTS_0]);
    }
  }
});
