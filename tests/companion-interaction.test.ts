import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { reachJoint } from '../lib/companion-interaction';

function arm() {
  const root = new THREE.Group();
  root.position.set(3, 2, -1);
  root.rotation.y = Math.PI / 3;
  root.scale.setScalar(1.7);
  const shoulder = new THREE.Bone(),
    elbow = new THREE.Bone(),
    hand = new THREE.Bone();
  elbow.position.y = 0.3;
  hand.position.y = 0.27;
  root.add(shoulder);
  shoulder.add(elbow);
  elbow.add(hand);
  root.updateMatrixWorld(true);
  return { root, shoulder, elbow, hand };
}
await test('two-bone contact reaches a world-space target under rotated and scaled parents', () => {
  const { root, shoulder, elbow, hand } = arm();
  const target = root.localToWorld(new THREE.Vector3(0.1, 0.18, 0.35));
  const pole = root.localToWorld(new THREE.Vector3(0.4, 0.2, 0.1));
  reachJoint(shoulder, elbow, hand, target, pole);
  assert.ok(
    hand.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 1e-6,
  );
  assert.ok(
    elbow.position.y === 0.3 && hand.position.y === 0.27,
    'IK must not stretch bones.',
  );
});
await test('unreachable hand targets are bounded and singular targets do not corrupt the skeleton', () => {
  const { root, shoulder, elbow, hand } = arm();
  const origin = shoulder.getWorldPosition(new THREE.Vector3());
  const pole = root.localToWorld(new THREE.Vector3(0.4, 0, 0));
  reachJoint(
    shoulder,
    elbow,
    hand,
    origin.clone().add(new THREE.Vector3(0, 5, 3)),
    pole,
  );
  assert.ok(
    hand.getWorldPosition(new THREE.Vector3()).distanceTo(origin) <= 0.57 * 1.7,
  );
  reachJoint(shoulder, elbow, hand, origin, pole);
  for (const bone of [shoulder, elbow, hand])
    assert.ok(bone.quaternion.toArray().every(Number.isFinite));
});
