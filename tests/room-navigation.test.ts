import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_LOCATIONS,
  ROOM_OBSTACLES,
  findRoomPath,
  clearPath,
  canStand,
  nearestZone,
} from '../lib/room-navigation';

await test('every named location is reachable without passing through furniture', () => {
  for (const start of Object.values(ROOM_LOCATIONS))
    for (const end of Object.values(ROOM_LOCATIONS)) {
      const path = findRoomPath(start, end);
      assert.ok(path.length);
      let previous = start;
      for (const point of path) {
        assert.ok(clearPath(previous, point));
        previous = point;
      }
      assert.deepEqual(path.at(-1), end);
    }
});
await test('free floor navigation routes around the coffee table and preserves the requested destination', () => {
  const start = { x: -1.85, z: -1.5 },
    end = { x: -1.85, z: 2 };
  assert.equal(clearPath(start, end), false);
  const path = findRoomPath(start, end);
  assert.ok(path.length > 1);
  let previous = start;
  for (const point of path) {
    assert.ok(clearPath(previous, point));
    previous = point;
  }
  assert.deepEqual(path.at(-1), end);
});
await test('walls, furniture, invalid coordinates and narrow corners cannot become walking destinations', () => {
  for (const obstacle of ROOM_OBSTACLES) {
    assert.equal(canStand(obstacle), false);
    assert.deepEqual(findRoomPath(ROOM_LOCATIONS.center, obstacle), []);
  }
  for (const point of [
    { x: 20, z: 0 },
    { x: 0, z: -20 },
    { x: NaN, z: 0 },
    { x: 0, z: Infinity },
  ]) {
    assert.equal(canStand(point), false);
    assert.deepEqual(findRoomPath(ROOM_LOCATIONS.center, point), []);
  }
  assert.equal(nearestZone({ x: 3.3, z: -1.7 }), 'window');
});
