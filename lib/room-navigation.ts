import type { Zone } from './entity-schema';

export type RoomPoint = { x: number; z: number };
export type RoomObstacle = {
  x: number;
  z: number;
  width: number;
  depth: number;
};
export const ROOM_BOUNDS = { minX: -4.65, maxX: 4.65, minZ: -3.65, maxZ: 3.65 };
export const ROOM_LOCATIONS: Record<Zone, RoomPoint> = {
  center: { x: 0, z: 0.8 },
  desk: { x: -1.55, z: -2.4 },
  window: { x: 3.5, z: -1.8 },
};
export const ROOM_OBSTACLES: RoomObstacle[] = [
  { x: -3.75, z: 0.3, width: 1.25, depth: 2.9 },
  { x: -1.85, z: 0.3, width: 1.05, depth: 1.55 },
  { x: -2.8, z: -3.2, width: 2.3, depth: 0.9 },
  { x: -2.8, z: -2.3, width: 0.6, depth: 0.6 },
  { x: 0.25, z: -3.7, width: 2.3, depth: 0.45 },
  { x: 2.85, z: 2.7, width: 2.7, depth: 1.05 },
  { x: 4.2, z: -3.15, width: 0.7, depth: 0.7 },
  { x: -4.15, z: 2.9, width: 0.65, depth: 0.65 },
];

export function canStand(point: RoomPoint, radius = 0.24) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const b = ROOM_BOUNDS;
  if (
    point.x < b.minX ||
    point.x > b.maxX ||
    point.z < b.minZ ||
    point.z > b.maxZ
  )
    return false;
  return !ROOM_OBSTACLES.some(
    (o) =>
      Math.abs(point.x - o.x) < o.width / 2 + radius &&
      Math.abs(point.z - o.z) < o.depth / 2 + radius,
  );
}

export function clearPath(a: RoomPoint, b: RoomPoint) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.08);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!canStand({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }))
      return false;
  }
  return true;
}

export function nearestZone(point: RoomPoint): Zone {
  return (Object.keys(ROOM_LOCATIONS) as Zone[]).reduce((best, zone) => {
    const a = ROOM_LOCATIONS[zone],
      b = ROOM_LOCATIONS[best];
    return Math.hypot(point.x - a.x, point.z - a.z) <
      Math.hypot(point.x - b.x, point.z - b.z)
      ? zone
      : best;
  }, 'center');
}

// A bounded navigation grid with clearance for the character, then visible-path smoothing.
export function findRoomPath(start: RoomPoint, end: RoomPoint): RoomPoint[] {
  if (!canStand(start) || !canStand(end)) return [];
  if (clearPath(start, end)) return [{ ...end }];
  const step = 0.2;
  const width = Math.floor((ROOM_BOUNDS.maxX - ROOM_BOUNDS.minX) / step) + 1;
  const depth = Math.floor((ROOM_BOUNDS.maxZ - ROOM_BOUNDS.minZ) / step) + 1;
  const point = (id: number): RoomPoint => ({
    x: ROOM_BOUNDS.minX + (id % width) * step,
    z: ROOM_BOUNDS.minZ + Math.floor(id / width) * step,
  });
  function nearest(p: RoomPoint) {
    let best = -1,
      distance = Infinity;
    for (let id = 0; id < width * depth; id++) {
      const q = point(id),
        d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < distance && clearPath(p, q)) {
        best = id;
        distance = d;
      }
    }
    return best;
  }
  const first = nearest(start),
    goal = nearest(end);
  if (first < 0 || goal < 0) return [];
  const open = new Set([first]),
    parents = new Map<number, number>(),
    costs = new Map([[first, 0]]);
  const visited = new Set<number>();
  while (open.size) {
    let current = -1,
      score = Infinity;
    for (const id of open) {
      const p = point(id),
        q = point(goal);
      const f = costs.get(id)! + Math.hypot(p.x - q.x, p.z - q.z);
      if (f < score) {
        score = f;
        current = id;
      }
    }
    if (current === goal) {
      const raw: RoomPoint[] = [{ ...end }];
      let id = goal;
      while (id !== first) {
        raw.unshift(point(id));
        id = parents.get(id)!;
      }
      raw.unshift(point(first));
      const result: RoomPoint[] = [];
      let from = start;
      for (let i = 0; i < raw.length;) {
        let last = i;
        for (let j = i + 1; j < raw.length; j++)
          if (clearPath(from, raw[j])) last = j;
        result.push(raw[last]);
        from = raw[last];
        i = last + 1;
      }
      return result;
    }
    open.delete(current);
    visited.add(current);
    const x = current % width,
      z = Math.floor(current / width);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (
          (!dx && !dz) ||
          x + dx < 0 ||
          x + dx >= width ||
          z + dz < 0 ||
          z + dz >= depth
        )
          continue;
        const next = (z + dz) * width + x + dx;
        if (visited.has(next) || !clearPath(point(current), point(next)))
          continue;
        const cost = costs.get(current)! + Math.hypot(dx, dz) * step;
        if (cost < (costs.get(next) ?? Infinity)) {
          costs.set(next, cost);
          parents.set(next, current);
          open.add(next);
        }
      }
  }
  return [];
}
