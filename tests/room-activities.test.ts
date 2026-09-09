import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RoomActivityController,
  ROOM_ACTIVITIES,
  type RoomActivity,
} from '../lib/room-activities';
import { canStand, clearPath, ROOM_LOCATIONS } from '../lib/room-navigation';

function advance(
  controller: RoomActivityController,
  condition: () => boolean,
  options = { autonomy: false },
) {
  for (let step = 0; step < 2400; step++) {
    const before = { ...controller.position },
      phase = controller.phase;
    controller.tick(0.05, options);
    if (phase === 'walking' && controller.phase === 'walking') {
      assert.ok(
        canStand(controller.position),
        'A walking frame entered furniture.',
      );
      assert.ok(
        clearPath(before, controller.position),
        'A walking frame crossed an obstacle.',
      );
      assert.ok(
        Math.hypot(
          controller.position.x - before.x,
          controller.position.z - before.z,
        ) <= 0.053,
      );
    }
    if (condition()) return;
  }
  assert.fail('Activity did not settle within two minutes.');
}
await test('every activity can be reached, occupied and left from every other activity', () => {
  for (const first of Object.keys(ROOM_ACTIVITIES) as RoomActivity[]) {
    const controller = new RoomActivityController(ROOM_LOCATIONS.center);
    assert.equal(controller.choose(first), true);
    advance(controller, () => controller.phase === 'active');
    assert.deepEqual(controller.position, ROOM_ACTIVITIES[first].anchor);
    for (const second of Object.keys(ROOM_ACTIVITIES) as RoomActivity[]) {
      assert.equal(controller.choose(second), true);
      advance(
        controller,
        () => controller.phase === 'active' && controller.activity === second,
      );
      assert.deepEqual(controller.position, ROOM_ACTIVITIES[second].anchor);
    }
    assert.equal(controller.walkTo(ROOM_LOCATIONS.center), true);
    advance(controller, () => controller.phase === 'free');
    assert.equal(controller.activity, null);
    assert.ok(canStand(controller.position));
  }
});
await test('invalid destinations do not interrupt reading; valid floor taps stand up before walking', () => {
  const c = new RoomActivityController(ROOM_LOCATIONS.center);
  c.choose('read');
  advance(c, () => c.phase === 'active');
  assert.equal(c.walkTo({ x: NaN, z: 0 }), false);
  assert.equal(c.walkTo({ x: -1.85, z: 0.3 }), false);
  assert.equal(c.phase, 'active');
  const seated = { ...c.position };
  assert.equal(c.walkTo(ROOM_LOCATIONS.window), true);
  assert.equal(c.phase, 'leaving');
  assert.deepEqual(c.position, seated);
  c.tick(0.05, { autonomy: false });
  assert.ok(c.blend > 0 && c.blend < 1);
  // A second request during standing replaces the pending destination.
  c.choose('code');
  advance(c, () => c.phase === 'active' && c.activity === 'code');
});
await test('autonomy advances only when allowed and gives manual choices a quiet interval', () => {
  const c = new RoomActivityController(ROOM_LOCATIONS.center);
  for (let i = 0; i < 800; i++) c.tick(0.05, { autonomy: true, blocked: true });
  assert.equal(c.phase, 'free');
  for (let i = 0; i < 800; i++) c.tick(0.05, { autonomy: true, reduced: true });
  assert.equal(c.phase, 'free');
  advance(c, () => c.phase === 'active', { autonomy: true });
  assert.equal(c.activity, 'read');
  c.choose('code');
  advance(c, () => c.phase === 'active' && c.activity === 'code');
  for (let i = 0; i < 500; i++) c.tick(0.05, { autonomy: false });
  assert.equal(c.activity, 'code');
});
