import * as THREE from 'three';
import type { RoomActivity } from './room-activities';

export type CompanionInteraction = {
  activity: RoomActivity;
  blend: number;
  seatHeight?: number;
  time: number;
  transitioning?: boolean;
};

/** Analytic two-bone reach, solved in world coordinates with an explicit elbow/knee pole. */
export function reachJoint(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  weight = 1,
) {
  upper.updateWorldMatrix(true, true);
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = lower.getWorldPosition(new THREE.Vector3());
  const c = end.getWorldPosition(new THREE.Vector3());
  const lengthA = a.distanceTo(b),
    lengthB = b.distanceTo(c);
  if (lengthA < 1e-5 || lengthB < 1e-5) return;
  const direction = target.clone().sub(a);
  const distance = THREE.MathUtils.clamp(
    direction.length(),
    Math.abs(lengthA - lengthB) + 1e-4,
    lengthA + lengthB - 1e-4,
  );
  if (direction.lengthSq() < 1e-10) return;
  direction.normalize();
  const perpendicular = pole
    .clone()
    .sub(a)
    .addScaledVector(direction, -pole.clone().sub(a).dot(direction));
  if (perpendicular.lengthSq() < 1e-10) return;
  perpendicular.normalize();
  const along =
    (lengthA * lengthA + distance * distance - lengthB * lengthB) /
    (2 * distance);
  const height = Math.sqrt(Math.max(0, lengthA * lengthA - along * along));
  const elbow = a
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(perpendicular, height);
  function aim(
    joint: THREE.Object3D,
    child: THREE.Object3D,
    point: THREE.Vector3,
  ) {
    const origin = joint.getWorldPosition(new THREE.Vector3());
    const before = child
      .getWorldPosition(new THREE.Vector3())
      .sub(origin)
      .normalize();
    const after = point.clone().sub(origin).normalize();
    const rotation = new THREE.Quaternion()
      .setFromUnitVectors(before, after)
      .multiply(joint.getWorldQuaternion(new THREE.Quaternion()));
    if (joint.parent)
      rotation.premultiply(
        joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert(),
      );
    joint.quaternion.slerp(rotation, weight);
    joint.updateWorldMatrix(false, true);
  }
  aim(upper, lower, elbow);
  aim(lower, end, a.addScaledVector(direction, distance));
}

export function createCompanionInteraction(
  body: THREE.Group,
  root: THREE.Object3D,
  orientation: THREE.Group,
) {
  const base = orientation.position.clone();
  const names = new Map<string, THREE.Object3D>();
  root.traverse((o) => names.set(o.name, o));
  const hips = names.get('Hips');
  const footRotations = new Map<string, THREE.Quaternion>();
  const restoreRotations = new Map<THREE.Object3D, THREE.Quaternion>();
  body.updateMatrixWorld(true);
  const standingHipY = hips
    ? body.worldToLocal(hips.getWorldPosition(new THREE.Vector3())).y
    : 0;
  for (const name of ['LeftFoot', 'RightFoot']) {
    const foot = names.get(name);
    if (foot)
      footRotations.set(
        name,
        body
          .getWorldQuaternion(new THREE.Quaternion())
          .invert()
          .multiply(foot.getWorldQuaternion(new THREE.Quaternion())),
      );
  }
  const handDirections = new Map<string, THREE.Vector3>();
  // Infer each wrist-to-fingers axis from its own skinned vertices, rather than assuming rig axes.
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const positions = object.geometry.getAttribute('position');
    const joints = object.geometry.getAttribute('skinIndex');
    const weights = object.geometry.getAttribute('skinWeight');
    if (!joints || !weights) return;
    for (const name of ['LeftHand', 'RightHand']) {
      const hand = names.get(name),
        index = object.skeleton.bones.findIndex((bone) => bone.name === name);
      if (!hand || index < 0) continue;
      const sum = new THREE.Vector3();
      let count = 0;
      for (let i = 0; i < positions.count; i++) {
        let weight = 0;
        for (let component = 0; component < 4; component++)
          if (joints.getComponent(i, component) === index)
            weight += weights.getComponent(i, component);
        if (weight < 0.7) continue;
        const point = new THREE.Vector3().fromBufferAttribute(positions, i);
        object.applyBoneTransform(i, point);
        object.localToWorld(point);
        hand.worldToLocal(point);
        sum.add(point);
        count++;
      }
      if (count && sum.lengthSq() > 1e-6)
        handDirections.set(name, sum.normalize());
    }
  });
  function aimHand(name: string, direction: THREE.Vector3, weight: number) {
    const hand = names.get(name),
      axis = handDirections.get(name);
    if (!hand?.parent || !axis) return;
    const world = hand.getWorldQuaternion(new THREE.Quaternion());
    const target = direction
      .clone()
      .applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const q = new THREE.Quaternion()
      .setFromUnitVectors(
        axis.clone().applyQuaternion(world).normalize(),
        target,
      )
      .multiply(world);
    q.premultiply(
      hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert(),
    );
    hand.quaternion.slerp(q, weight);
    hand.updateWorldMatrix(false, true);
  }
  const book = new THREE.Group();
  book.name = 'Zuri’s open book';
  book.visible = false;
  const cover = new THREE.MeshStandardMaterial({
    color: '#665074',
    roughness: 0.87,
  });
  const page = new THREE.MeshStandardMaterial({
    color: '#efe4ce',
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const ink = new THREE.MeshStandardMaterial({
    color: '#9b8c7e',
    roughness: 1,
  });
  function part(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent = book,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.rotation.z = side * 0.07;
    book.add(leaf);
    part(0.16, 0.008, 0.22, cover, side * 0.083, -0.016, 0, leaf);
    part(0.15, 0.021, 0.207, page, side * 0.082, 0, 0, leaf);
    for (let row = 0; row < 12; row++)
      part(
        0.115 - (row % 4) * 0.007,
        0.0007,
        0.0014,
        ink,
        side * 0.081,
        0.011,
        -0.083 + row * 0.014,
        leaf,
      );
  }
  const turning = new THREE.Group();
  const sheet = part(0.153, 0.001, 0.207, page, 0.078, 0.016, 0, turning);
  book.add(turning);
  // The imported hierarchy may be authored in other units; props always stay in metres.
  const worldPoint = (x: number, y: number, z: number) =>
    body.localToWorld(
      new THREE.Vector3(x / body.scale.x, y / body.scale.y, z / body.scale.z),
    );
  function reach(
    side: string,
    limb: 'arm' | 'leg',
    target: number[],
    pole: number[],
    weight: number,
  ) {
    const chain =
      limb === 'arm' ? ['Arm', 'ForeArm', 'Hand'] : ['UpLeg', 'Leg', 'Foot'];
    const [a, b, c] = chain.map((name) => names.get(side + name));
    if (a && b && c)
      reachJoint(
        a,
        b,
        c,
        worldPoint(target[0], target[1], target[2]),
        worldPoint(pole[0], pole[1], pole[2]),
        weight,
      );
  }
  function preserve(o: THREE.Object3D | undefined) {
    if (o && !restoreRotations.has(o))
      restoreRotations.set(o, o.quaternion.clone());
  }
  return {
    dispose() {
      book.removeFromParent();
      book.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      cover.dispose();
      page.dispose();
      ink.dispose();
    },
    reset() {
      orientation.position.copy(base);
      for (const [object, quaternion] of restoreRotations)
        object.quaternion.copy(quaternion);
      restoreRotations.clear();
      book.visible = false;
      book.removeFromParent();
    },
    apply(interaction: CompanionInteraction | undefined, reduced: boolean) {
      if (!interaction || !hips) return;
      const { activity, seatHeight } = interaction;
      const weight = THREE.MathUtils.smoothstep(interaction.blend, 0, 1);
      const time = reduced ? 0 : interaction.time;
      if (weight <= 0 && seatHeight === undefined) return;
      for (const object of names.values())
        if (object instanceof THREE.Bone) preserve(object);
      if (seatHeight !== undefined) {
        body.updateMatrixWorld(true);
        const hip = body.worldToLocal(
          hips.getWorldPosition(new THREE.Vector3()),
        );
        orientation.position.x -= hip.x;
        orientation.position.z -= hip.z;
        orientation.position.y +=
          THREE.MathUtils.lerp(
            standingHipY,
            (seatHeight + 0.085) / body.scale.y,
            weight,
          ) - hip.y;
        body.updateMatrixWorld(true);
        // Both feet are planted. This also removes crossed knees from the source seated clip.
        for (const [side, sign] of [
          ['Left', 1],
          ['Right', -1],
        ] as const) {
          reach(
            side,
            'leg',
            [sign * 0.12, 0.155, 0.04 + weight * 0.38],
            [sign * 0.17, 0.56, 0.62],
            1,
          );
          const foot = names.get(side + 'Foot'),
            rest = footRotations.get(side + 'Foot');
          if (foot?.parent && rest) {
            const q = foot.parent
              .getWorldQuaternion(new THREE.Quaternion())
              .invert()
              .multiply(body.getWorldQuaternion(new THREE.Quaternion()))
              .multiply(rest);
            foot.quaternion.copy(q);
          }
        }
      }
      if (activity === 'read') {
        body.add(book);
        const height = (seatHeight ?? 0.59) + 0.31;
        book.visible = weight > 0.9;
        book.scale.setScalar(1 / body.scale.x);
        book.position.set(0, height / body.scale.y, 0.32 / body.scale.z);
        book.rotation.x = -0.28;
        const pageTime = time % 13;
        turning.rotation.z =
          pageTime > 11
            ? Math.PI * THREE.MathUtils.smoothstep(pageTime, 11, 12.7)
            : 0;
        sheet.visible = !reduced && pageTime > 11;
        for (const [side, sign] of [
          ['Left', 1],
          ['Right', -1],
        ] as const) {
          const turn =
            side === 'Right' && pageTime > 11 && !reduced
              ? Math.sin(((pageTime - 11) / 2) * Math.PI)
              : 0;
          reach(
            side,
            'arm',
            [sign * (0.155 - turn * 0.13), height - 0.012 + turn * 0.04, 0.3],
            [sign * 0.33, height - 0.13, 0.08],
            weight,
          );
        }
      } else if (activity === 'code') {
        for (const [side, sign] of [
          ['Left', 1],
          ['Right', -1],
        ] as const) {
          const typing =
            Math.sin(time * 10 + sign) * Math.sin(time * 3.1) * 0.009;
          reach(
            side,
            'arm',
            [
              sign * 0.135 - 0.08 + Math.sin(time * 1.7 + sign) * 0.014,
              0.848 + typing,
              0.43,
            ],
            [sign * 0.3, 0.86, 0.15],
            weight,
          );
          aimHand(side + 'Hand', new THREE.Vector3(0, -0.13, 1), weight);
        }
      } else if (activity === 'rest') {
        for (const [side, sign] of [
          ['Left', 1],
          ['Right', -1],
        ] as const)
          reach(
            side,
            'arm',
            [sign * 0.12, (seatHeight ?? 0.59) + 0.09, 0.22],
            [sign * 0.29, 0.86, 0.1],
            weight,
          );
      } else if (activity === 'stretch') {
        const height = 1.58 + Math.sin(time * 0.6) * 0.07;
        for (const [side, sign] of [
          ['Left', 1],
          ['Right', -1],
        ] as const)
          reach(
            side,
            'arm',
            [sign * 0.23, height, 0.04],
            [sign * 0.55, 1.43, 0.02],
            weight,
          );
      }
      const head = names.get('Head'),
        front = names.get('headfront');
      if (head && front && (activity === 'read' || activity === 'code')) {
        const origin = head.getWorldPosition(new THREE.Vector3());
        const forward = front
          .getWorldPosition(new THREE.Vector3())
          .sub(origin)
          .normalize();
        const target =
          activity === 'read'
            ? worldPoint(0, (seatHeight ?? 0.59) + 0.31, 0.32)
            : worldPoint(Math.sin(time * 0.37) * 0.03, 1.17, 0.96);
        const q = new THREE.Quaternion()
          .setFromUnitVectors(forward, target.sub(origin).normalize())
          .multiply(head.getWorldQuaternion(new THREE.Quaternion()));
        if (head.parent)
          q.premultiply(
            head.parent.getWorldQuaternion(new THREE.Quaternion()).invert(),
          );
        head.quaternion.slerp(q, weight * 0.88);
      } else if (head) {
        head.rotateY(
          Math.sin(time * (activity === 'window' ? 0.23 : 0.47)) *
            (activity === 'window' ? 0.17 : 0.035) *
            weight,
        );
      }
      body.updateMatrixWorld(true);
    },
  };
}
