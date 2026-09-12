import * as THREE from 'three';
import { ZURI } from './companion-character';
import { ZURI_MODEL, loadCompanionModel } from './companion-model';

export type CompanionPose =
  | 'idle'
  | 'walk'
  | 'think'
  | 'wave'
  | 'sit'
  | 'stand';

type Ring = [height: number, width: number, depth: number];

function silhouette(rings: Ring[], segments = 48) {
  const positions: number[] = [];
  const indices: number[] = [];
  rings.forEach(([y, rx, rz]) => {
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function material(color: string, roughness = 0.7, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function attach(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  surface: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function oval(
  parent: THREE.Object3D,
  surface: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
) {
  const mesh = attach(
    parent,
    new THREE.SphereGeometry(1, 28, 20),
    surface,
    ...position,
  );
  mesh.scale.set(...scale);
  return mesh;
}

function stroke(
  parent: THREE.Object3D,
  points: [number, number, number][],
  radius: number,
  surface: THREE.Material,
) {
  const path = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
  );
  return attach(
    parent,
    new THREE.TubeGeometry(path, 32, radius, 8, false),
    surface,
  );
}

export function disposeAvatar(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const surfaces = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
      surfaces.add(m),
    );
  });
  geometries.forEach((g) => g.dispose());
  surfaces.forEach((m) => m.dispose());
}

export function createCompanion() {
  const body = new THREE.Group();
  body.name = ZURI.name;
  body.userData = {
    characterId: ZURI.id,
    characterVersion: ZURI.version,
    geometry: 'procedural',
  };
  const palette = ZURI.appearance.palette;
  const skin = material(palette.skin, 0.78);
  const skinShadow = material(palette.skinDetail, 0.85);
  const lips = material(palette.lips, 0.74);
  skin.name = 'Zuri deep warm-brown skin';
  skinShadow.name = 'Zuri skin detail';
  lips.name = 'Zuri lips';
  const navy = material(palette.dress, 0.84);
  const sleeveSurface = material(palette.sleeve, 0.88);
  const ivory = material(palette.collar, 0.92);
  const hair = material(palette.hair, 0.56);
  const hairRidge = material(palette.hairHighlight, 0.65);
  const teal = material(palette.hairAccent, 0.68);
  const brass = material(palette.brass, 0.34, 0.55);
  const jade = material(palette.jade, 0.3, 0.12);
  const dark = material('#19222b', 0.78);
  const whites = material('#ece8de', 0.4);
  const iris = material(palette.eyes, 0.38);
  const glint = new THREE.MeshBasicMaterial({ color: '#fff9e9' });

  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.y = 1.61;
  body.add(pelvis);

  const torso = new THREE.Group();
  torso.name = 'torso';
  pelvis.add(torso);
  attach(
    torso,
    silhouette([
      [-0.06, 0.26, 0.16],
      [0.04, 0.285, 0.175],
      [0.15, 0.245, 0.16],
      [0.29, 0.22, 0.145],
      [0.43, 0.25, 0.17],
      [0.58, 0.295, 0.185],
      [0.69, 0.34, 0.145],
      [0.74, 0.28, 0.12],
      [0.79, 0.12, 0.085],
      [0.79, 0, 0],
    ]),
    navy,
  );
  // A high ivory collar and diagonal wrap seam give the silhouette its own language.
  attach(
    torso,
    silhouette([
      [0.63, 0.135, 0.112],
      [0.81, 0.115, 0.09],
      [0.85, 0.1, 0.08],
    ]),
    ivory,
    0,
    0,
    0.035,
  );
  stroke(
    torso,
    [
      [-0.12, 0.77, 0.125],
      [0.05, 0.56, 0.193],
      [0.22, 0.33, 0.14],
    ],
    0.008,
    brass,
  );
  stroke(
    torso,
    [
      [0.24, 0.32, 0.07],
      [0.12, 0.3, 0.137],
      [0, 0.29, 0.151],
      [-0.22, 0.3, 0.065],
    ],
    0.008,
    brass,
  );
  oval(torso, brass, [0.22, 0.31, 0.12], [0.03, 0.025, 0.012]);

  const skirt = attach(
    pelvis,
    silhouette([
      [-0.6, 0, 0],
      [-0.6, 0.43, 0.245],
      [-0.56, 0.435, 0.247],
      [-0.38, 0.37, 0.222],
      [-0.12, 0.31, 0.2],
      [0.12, 0.28, 0.176],
      [0.18, 0.25, 0.162],
      [0.18, 0, 0],
    ]),
    navy,
  );
  skirt.name = 'wrap-skirt';
  stroke(
    pelvis,
    [
      [0.21, 0.16, 0.12],
      [0.25, -0.06, 0.145],
      [0.28, -0.3, 0.173],
      [0.3, -0.57, 0.18],
    ],
    0.007,
    brass,
  );
  for (const x of [-0.23, -0.1, 0.07]) {
    stroke(
      pelvis,
      [
        [x, -0.12, 0.195],
        [x * 1.2, -0.36, 0.224],
        [x * 1.35, -0.57, 0.235],
      ],
      0.0035,
      sleeveSurface,
    );
  }

  const legs: { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }[] =
    [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.name = side < 0 ? 'left-hip' : 'right-hip';
    hip.position.set(side * 0.15, -0.12, 0);
    pelvis.add(hip);
    attach(
      hip,
      silhouette([
        [-0.68, 0.085, 0.09],
        [-0.57, 0.105, 0.106],
        [-0.3, 0.12, 0.12],
        [0, 0.14, 0.13],
        [0.02, 0, 0],
      ]),
      skin,
    );
    const knee = new THREE.Group();
    knee.position.y = -0.64;
    hip.add(knee);
    oval(knee, skin, [0, 0, 0], [0.09, 0.09, 0.095]);
    attach(
      knee,
      silhouette([
        [-0.67, 0.057, 0.066],
        [-0.53, 0.061, 0.075],
        [-0.34, 0.079, 0.093],
        [-0.18, 0.095, 0.108],
        [0, 0.088, 0.088],
      ]),
      skin,
    );
    const ankle = new THREE.Group();
    ankle.position.y = -0.64;
    knee.add(ankle);
    // Ankle boots, rounded toes, and a narrow brass edge.
    attach(
      ankle,
      silhouette([
        [-0.12, 0.085, 0.15],
        [-0.04, 0.083, 0.12],
        [0.09, 0.074, 0.087],
        [0.17, 0.074, 0.081],
      ]),
      dark,
      0,
      0,
      0.028,
    );
    oval(ankle, dark, [0, -0.09, 0.085], [0.09, 0.075, 0.17]);
    stroke(
      ankle,
      [
        [-0.067, 0.145, 0.05],
        [0, 0.145, 0.086],
        [0.067, 0.145, 0.05],
      ],
      0.007,
      brass,
    );
    legs.push({ hip, knee, ankle });
  }

  const arms: {
    shoulder: THREE.Group;
    elbow: THREE.Group;
    wrist: THREE.Group;
  }[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'left-shoulder' : 'right-shoulder';
    shoulder.position.set(side * 0.31, 0.67, 0);
    torso.add(shoulder);
    oval(shoulder, sleeveSurface, [side * 0.02, -0.04, 0], [0.119, 0.13, 0.13]);
    attach(
      shoulder,
      silhouette([
        [-0.44, 0.077, 0.083],
        [-0.22, 0.097, 0.107],
        [0, 0.11, 0.116],
        [0.035, 0, 0],
      ]),
      sleeveSurface,
    );
    const elbow = new THREE.Group();
    elbow.position.y = -0.425;
    shoulder.add(elbow);
    oval(elbow, sleeveSurface, [0, 0, 0], [0.08, 0.082, 0.087]);
    attach(
      elbow,
      silhouette([
        [-0.4, 0.062, 0.066],
        [-0.35, 0.067, 0.072],
        [-0.16, 0.08, 0.09],
        [0, 0.08, 0.084],
      ]),
      sleeveSurface,
    );
    attach(
      elbow,
      silhouette([
        [-0.405, 0.065, 0.067],
        [-0.367, 0.068, 0.074],
      ]),
      ivory,
    );
    const wrist = new THREE.Group();
    wrist.position.y = -0.41;
    elbow.add(wrist);
    oval(wrist, skin, [0, -0.07, 0], [0.058, 0.095, 0.035]);
    // Each hand has four individually shaped fingers and an opposed thumb.
    for (let finger = 0; finger < 4; finger++) {
      const x = (finger - 1.5) * 0.026;
      const length = 0.072 - Math.abs(finger - 1.5) * 0.013;
      oval(wrist, skin, [x, -0.15, 0.007], [0.014, length, 0.018]);
    }
    const thumb = oval(
      wrist,
      skin,
      [-side * 0.065, -0.068, 0.012],
      [0.023, 0.06, 0.026],
    );
    thumb.rotation.z = side * 0.55;
    arms.push({ shoulder, elbow, wrist });
  }

  attach(
    torso,
    new THREE.CylinderGeometry(0.085, 0.105, 0.23, 24),
    skin,
    0,
    0.86,
    0,
  );
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.12, 0);
  torso.add(head);
  attach(
    head,
    silhouette([
      [-0.295, 0.04, 0.075],
      [-0.27, 0.105, 0.115],
      [-0.21, 0.165, 0.154],
      [-0.11, 0.215, 0.185],
      [0.005, 0.238, 0.204],
      [0.12, 0.242, 0.21],
      [0.24, 0.205, 0.192],
      [0.31, 0.12, 0.123],
      [0.335, 0, 0],
    ]),
    skin,
  );
  for (const side of [-1, 1]) {
    oval(head, skin, [side * 0.233, -0.036, 0], [0.047, 0.082, 0.05]);
    oval(
      head,
      skinShadow,
      [side * 0.262, -0.036, 0.019],
      [0.012, 0.045, 0.027],
    );
    oval(head, jade, [side * 0.24, -0.138, 0.015], [0.025, 0.043, 0.02]);
    oval(head, brass, [side * 0.24, -0.104, 0.023], [0.014, 0.014, 0.01]);
  }

  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.103, 0.013, 0.187);
    eye.rotation.y = side * 0.2;
    head.add(eye);
    eyes.push(eye);
    oval(eye, skinShadow, [0, 0, 0], [0.081, 0.043, 0.025]);
    oval(eye, whites, [0, 0, 0.009], [0.073, 0.032, 0.023]);
    oval(eye, iris, [0, 0, 0.027], [0.026, 0.028, 0.012]);
    oval(eye, dark, [0, 0, 0.036], [0.013, 0.02, 0.008]);
    oval(eye, glint, [-0.009, 0.011, 0.043], [0.006, 0.006, 0.004]);
    stroke(
      eye,
      [
        [-0.071, 0.003, 0.02],
        [-0.03, 0.03, 0.026],
        [0.028, 0.03, 0.026],
        [0.073, 0.003, 0.014],
      ],
      0.006,
      hair,
    );
    stroke(
      head,
      [
        [side * 0.04, 0.101, 0.203],
        [side * 0.103, 0.117, 0.201],
        [side * 0.177, 0.096, 0.17],
      ],
      0.014,
      hair,
    );
  }
  oval(head, skin, [0, -0.032, 0.2], [0.039, 0.074, 0.045]);
  oval(head, skin, [0, -0.068, 0.229], [0.043, 0.032, 0.038]);
  const mouth = stroke(
    head,
    [
      [-0.074, -0.161, 0.16],
      [-0.034, -0.171, 0.179],
      [0, -0.168, 0.188],
      [0.034, -0.171, 0.179],
      [0.074, -0.157, 0.16],
    ],
    0.011,
    lips,
  );
  mouth.name = 'smile';
  oval(head, skin, [0, -0.2, 0.148], [0.065, 0.03, 0.025]);

  // Asymmetric bob: a crown surface and shaped side/back locks.
  const hairCrown = attach(
    head,
    new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
    0,
    0.05,
    -0.026,
  );
  hairCrown.scale.set(0.267, 0.319, 0.246);
  for (let i = 0; i < 13; i++) {
    const angle = Math.PI * 0.94 + (i / 12) * Math.PI * 1.12;
    const x = Math.cos(angle) * 0.225,
      z = Math.sin(angle) * 0.198;
    const long = 0.2 + (i % 3) * 0.011;
    const lock = oval(
      head,
      i % 3 === 0 ? hairRidge : hair,
      [x, -0.05, z - 0.033],
      [0.084, long + 0.105, 0.066],
    );
    lock.rotation.z = -x * 0.16;
  }
  // Face framing locks leave both eyes and the adult jawline visible.
  const leftLock = oval(
    head,
    hair,
    [-0.224, -0.047, 0.077],
    [0.072, 0.252, 0.086],
  );
  leftLock.rotation.z = -0.08;
  const rightLock = oval(
    head,
    teal,
    [0.229, -0.067, 0.042],
    [0.06, 0.25, 0.079],
  );
  rightLock.rotation.z = 0.07;
  const fringe = oval(head, hair, [-0.079, 0.21, 0.166], [0.199, 0.101, 0.094]);
  fringe.rotation.z = 0.29;
  const fringeTip = oval(
    head,
    hair,
    [-0.181, 0.141, 0.177],
    [0.082, 0.115, 0.054],
  );
  fringeTip.rotation.z = -0.3;
  for (let i = 0; i < 5; i++) {
    const x = -0.16 + i * 0.062;
    stroke(
      head,
      [
        [x * 0.42, 0.353, -0.055],
        [x, 0.325, 0.089],
        [x - 0.035, 0.252, 0.224],
      ],
      0.004,
      hairRidge,
    );
  }
  const pin = attach(
    head,
    new THREE.CapsuleGeometry(0.012, 0.09, 4, 12),
    brass,
    0.214,
    0.172,
    0.168,
  );
  pin.name = 'brass-barrette';
  pin.scale.z = 0.45;
  pin.rotation.y = 0.37;
  pin.rotation.z = -0.18;

  const rest = () => {
    pelvis.position.set(0, 1.61, 0);
    pelvis.rotation.set(0, 0, 0);
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    arms.forEach(({ shoulder, elbow, wrist }, i) => {
      shoulder.rotation.set(0, 0, i === 0 ? -0.1 : 0.1);
      elbow.rotation.set(-0.08, 0, 0);
      wrist.rotation.set(0, 0, 0);
    });
    legs.forEach(({ hip, knee, ankle }) => {
      hip.rotation.set(0, 0, 0);
      knee.rotation.set(0, 0, 0);
      ankle.rotation.set(0, 0, 0);
    });
    eyes.forEach((eye) => {
      eye.scale.y = 1;
    });
  };
  rest();
  let time = 0;
  const weights: Record<CompanionPose, number> = {
    idle: 1,
    walk: 0,
    think: 0,
    sit: 0,
    stand: 0,
    wave: 0,
  };
  let disposed = false;
  return {
    body,
    update(dt: number, pose: CompanionPose, reduced: boolean) {
      if (disposed) return;
      rest();
      if (reduced) return;
      time += Math.max(0, Math.min(dt, 0.1));
      const mix = 1 - Math.exp(-Math.min(dt, 0.1) * 8);
      for (const key of Object.keys(weights) as CompanionPose[])
        weights[key] += ((key === pose ? 1 : 0) - weights[key]) * mix;
      const walk = weights.walk,
        wave = weights.wave,
        think = weights.think;
      const gait = Math.sin(time * 7.6);
      pelvis.position.y +=
        Math.sin(time * 2) * 0.007 + Math.abs(gait) * 0.021 * walk;
      pelvis.rotation.z = gait * 0.018 * walk;
      torso.rotation.y = gait * 0.045 * walk;
      torso.rotation.x = Math.sin(time * 1.6) * 0.006;
      head.rotation.z =
        Math.sin(time * 0.73) * 0.025 * (1 - walk) + think * 0.09;
      head.rotation.x = -think * 0.11;
      head.rotation.y = Math.sin(time * 0.51) * 0.035 * (1 - walk);
      legs.forEach(({ hip, knee, ankle }, i) => {
        const step = Math.sin(time * 7.6 + i * Math.PI);
        hip.rotation.x = step * 0.28 * walk;
        knee.rotation.x = Math.max(0, -step) * 0.38 * walk;
        ankle.rotation.x = -knee.rotation.x * 0.35;
      });
      arms.forEach(({ shoulder, elbow }, i) => {
        shoulder.rotation.x = -Math.sin(time * 7.6 + i * Math.PI) * 0.24 * walk;
        elbow.rotation.x -= Math.abs(gait) * 0.09 * walk;
      });
      // Raised right forearm, open palm, and a soft wrist wave.
      arms[1].shoulder.rotation.z += wave * 0.48;
      arms[1].shoulder.rotation.x -= wave * 0.25;
      arms[1].elbow.rotation.x -= wave * 2.12;
      arms[1].wrist.rotation.z = wave * Math.sin(time * 6.2) * 0.29;
      arms[1].wrist.rotation.y = -wave * 0.35;
      // A chin-adjacent thinking gesture, with the other arm at rest.
      arms[0].shoulder.rotation.x -= think * 0.52;
      arms[0].shoulder.rotation.z += think * 0.31;
      arms[0].elbow.rotation.x -= think * 1.69;
      arms[0].wrist.rotation.y = think * 0.3;
      const blinkPhase = time % 4.9;
      const blink =
        blinkPhase < 0.17
          ? 1 - Math.sin((blinkPhase / 0.17) * Math.PI) * 0.92
          : 1;
      eyes.forEach((eye) => {
        eye.scale.y = blink;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeAvatar(body);
    },
  };
}

export function loadCompanion(signal?: AbortSignal) {
  if (ZURI_MODEL) return loadCompanionModel(ZURI_MODEL, signal);
  return Promise.resolve(createCompanion());
}
