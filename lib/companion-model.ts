import * as THREE from 'three';
import type { CompanionPose } from './companion-avatar';
import { NIA } from './companion-character';

export type CompanionModelSpec = {
  src: `/characters/${string}.glb`;
  height: number;
  facing?: number;
  clips: Partial<Record<CompanionPose, string>>;
};

export const NIA_MODEL: CompanionModelSpec = {
  src: '/characters/nia-v2.glb',
  height: 1.68,
  facing: 0,
  clips: { idle: 'Idle', walk: 'Walk', wave: 'Wave' },
};

export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  const bitmaps = new Set<ImageBitmap>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const texture of textures) {
    const images = Array.isArray(texture.image)
      ? texture.image
      : [texture.image];
    for (const image of images) {
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
        bitmaps.add(image);
    }
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function createModelCompanion(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[],
  spec: CompanionModelSpec,
) {
  const body = new THREE.Group();
  const orientation = new THREE.Group();
  orientation.rotation.y = spec.facing ?? 0;
  orientation.add(root);
  body.add(orientation);
  body.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(body, true);
  const size = bounds.getSize(new THREE.Vector3());
  if (
    bounds.isEmpty() ||
    ![size.x, size.y, size.z, spec.height].every(Number.isFinite) ||
    size.y < 0.0001 ||
    spec.height <= 0
  ) {
    disposeModel(body);
    throw new Error('Character model has no usable geometry.');
  }
  const scale = spec.height / size.y;
  const center = bounds.getCenter(new THREE.Vector3());
  // Keep the imported root transforms intact: animation tracks may address them.
  body.scale.setScalar(scale);
  orientation.position.set(-center.x, -bounds.min.y, -center.z);
  body.name = NIA.name;
  body.userData = {
    characterId: NIA.id,
    characterVersion: NIA.version,
    geometry: 'glb',
    model: spec.src,
    height: spec.height,
  };
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      // Imported colors, normal maps, alpha modes and roughness remain intact.
      if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<CompanionPose, THREE.AnimationAction>();
  for (const [pose, name] of Object.entries(spec.clips)) {
    const clip = THREE.AnimationClip.findByName(clips, name);
    if (!clip) {
      mixer.uncacheRoot(root);
      disposeModel(body);
      throw new Error(`Character animation is missing: ${name}`);
    }
    const action = mixer.clipAction(clip);
    if (pose === 'wave') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions.set(pose as CompanionPose, action);
  }
  let current: THREE.AnimationAction | undefined;
  let disposed = false;
  function select(pose: CompanionPose, immediate: boolean) {
    const next = actions.get(pose) ?? actions.get('idle');
    if (next === current) return;
    const previous = current;
    current = next;
    if (immediate) mixer.stopAllAction();
    if (!next) return;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (previous && !immediate) next.crossFadeFrom(previous, 0.35, false);
  }
  select('idle', true);
  mixer.update(0);
  return {
    body,
    update(dt: number, pose: CompanionPose, reduced: boolean) {
      if (disposed) return;
      if (reduced) {
        mixer.stopAllAction();
        current = undefined;
        select('idle', true);
        mixer.update(0);
        return;
      }
      select(pose, false);
      mixer.update(
        Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.05) : 0,
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      disposeModel(body);
    },
  };
}

export async function loadCompanionModel(
  spec: CompanionModelSpec,
  signal?: AbortSignal,
) {
  if (
    !/^\/characters\/[a-zA-Z0-9_./-]+\.glb$/.test(spec.src) ||
    spec.src.includes('..')
  )
    throw new Error('Character models must be bundled with the website.');
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
    : AbortSignal.timeout(45_000);
  const response = await fetch(spec.src, { signal: requestSignal });
  if (!response.ok || !response.body)
    throw new Error('Character download failed.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const limit = 64 * 1024 * 1024;
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error('Character model exceeds the download budget.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const header = new DataView(bytes.buffer);
  if (
    length < 20 ||
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2
  )
    throw new Error('Expected a binary glTF 2.0 character model.');
  if (header.getUint32(8, true) !== length)
    throw new Error('Character model download is incomplete.');
  const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] =
    await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]);
  requestSignal.throwIfAborted();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      url.startsWith('/decoders/draco/')
    )
      return url;
    throw new Error(
      'Character textures and buffers must be embedded in the GLB.',
    );
  });
  const draco = new DRACOLoader(manager)
    .setDecoderPath('/decoders/draco/')
    .setWorkerLimit(2);
  try {
    const loader = new GLTFLoader(manager)
      .setDRACOLoader(draco)
      .setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes.buffer, '');
    if (requestSignal.aborted) {
      for (const scene of gltf.scenes) disposeModel(scene);
      requestSignal.throwIfAborted();
    }
    return createModelCompanion(gltf.scene, gltf.animations, spec);
  } finally {
    draco.dispose();
  }
}
