import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createModelCompanion,
  loadCompanionModel,
  type CompanionModelSpec,
} from '../lib/companion-model';

const spec: CompanionModelSpec = {
  src: '/characters/nia-test.glb',
  height: 1.68,
  clips: {},
};

await test('model import preserves authored transforms and materials while grounding a scaled character', () => {
  const root = new THREE.Group();
  root.position.set(4, -5, 9);
  root.scale.setScalar(100);
  const material = new THREE.MeshStandardMaterial({
    color: '#68412d',
    roughness: 0.63,
  });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), material));
  const character = createModelCompanion(root, [], {
    ...spec,
    facing: Math.PI,
  });
  const bounds = new THREE.Box3().setFromObject(character.body, true);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).y - 1.68) < 1e-6);
  assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).x) < 1e-6);
  assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).z) < 1e-6);
  assert.deepEqual(root.position.toArray(), [4, -5, 9]);
  assert.equal(root.scale.x, 100);
  assert.equal((root.children[0] as THREE.Mesh).material, material);
  character.dispose();
});

await test('embedded animation changes poses, crossfades and returns to a static idle under reduced motion', () => {
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshStandardMaterial(),
    ),
  );
  const joint = new THREE.Object3D();
  joint.name = 'gesture';
  root.add(joint);
  const clips = [
    new THREE.AnimationClip('Rest', 1, [
      new THREE.NumberKeyframeTrack('gesture.rotation[x]', [0, 1], [0, 0]),
    ]),
    new THREE.AnimationClip('Hello', 1, [
      new THREE.NumberKeyframeTrack('gesture.rotation[x]', [0, 1], [1, 1]),
    ]),
  ];
  const character = createModelCompanion(root, clips, {
    ...spec,
    clips: { idle: 'Rest', wave: 'Hello' },
  });
  for (let i = 0; i < 10; i++) character.update(0.05, 'wave', false);
  assert.ok(joint.rotation.x > 0.95);
  character.update(0.05, 'wave', true);
  assert.ok(Math.abs(joint.rotation.x) < 1e-6);
  for (let i = 0; i < 10; i++) character.update(0.05, 'wave', false);
  assert.ok(joint.rotation.x > 0.95);
  for (let i = 0; i < 10; i++) character.update(0.05, 'think', false);
  assert.ok(Math.abs(joint.rotation.x) < 1e-6);
  character.dispose();
});

await test('shared textures, geometry and materials are released once, including repeated cleanup', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    normalMap: texture,
  });
  root.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  const disposed = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener('dispose', () => disposed.geometry++);
  material.addEventListener('dispose', () => disposed.material++);
  texture.addEventListener('dispose', () => disposed.texture++);
  const character = createModelCompanion(root, [], spec);
  character.dispose();
  character.dispose();
  assert.deepEqual(disposed, { geometry: 1, material: 1, texture: 1 });
});

await test('empty geometry and declared animations absent from the asset fail instead of pretending to load', () => {
  assert.throws(
    () => createModelCompanion(new THREE.Group(), [], spec),
    /no usable geometry/,
  );
  const root = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  assert.throws(
    () =>
      createModelCompanion(root, [], { ...spec, clips: { idle: 'Missing' } }),
    /animation is missing/,
  );
});

await test('loader rejects an HTML error response and off-site model paths', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>not a model</html>'),
  );
  await assert.rejects(loadCompanionModel(spec), /binary glTF/);
  await assert.rejects(
    loadCompanionModel({ ...spec, src: '/characters/../remote.glb' }),
    /bundled/,
  );
});

await test('loader parses a self-contained GLB through the real glTF loader without secondary downloads', async (t) => {
  const positions = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 2, 0]);
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-0.5, 0, 0],
        max: [0.5, 2, 0],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
    ],
    buffers: [{ byteLength: positions.byteLength }],
  };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const data = new ArrayBuffer(12 + 8 + jsonLength + 8 + positions.byteLength);
  const header = new DataView(data);
  for (const [offset, value] of [
    [0, 0x46546c67],
    [4, 2],
    [8, data.byteLength],
    [12, jsonLength],
    [16, 0x4e4f534a],
    [20 + jsonLength, positions.byteLength],
    [24 + jsonLength, 0x004e4942],
  ])
    header.setUint32(offset, value, true);
  new Uint8Array(data, 20, jsonLength).fill(32);
  new Uint8Array(data, 20, json.length).set(json);
  new Uint8Array(data, 28 + jsonLength).set(new Uint8Array(positions.buffer));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    requests++;
    assert.equal(path, spec.src);
    return new Response(data, {
      headers: { 'content-type': 'model/gltf-binary' },
    });
  });
  const character = await loadCompanionModel(spec);
  assert.equal(requests, 1);
  assert.equal(character.body.userData.geometry, 'glb');
  const bounds = new THREE.Box3().setFromObject(character.body);
  assert.ok(Math.abs(bounds.max.y - spec.height) < 1e-6);
  character.dispose();
});
