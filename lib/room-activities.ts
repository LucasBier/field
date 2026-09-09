import { canStand, findRoomPath, type RoomPoint } from './room-navigation';

export type RoomActivity = 'read' | 'code' | 'rest' | 'window' | 'stretch';
export type ActivityPhase =
  | 'free'
  | 'walking'
  | 'settling'
  | 'active'
  | 'leaving';
export type ActivityPlace = {
  label: string;
  doing: string;
  approach: RoomPoint;
  anchor: RoomPoint;
  facing: number;
  seatHeight?: number;
};
export const ROOM_ACTIVITIES: Record<RoomActivity, ActivityPlace> = {
  read: {
    label: 'Read on the sofa',
    doing: 'Reading on the sofa',
    approach: { x: -2.76, z: 0.3 },
    anchor: { x: -3.4, z: 0.3 },
    facing: Math.PI / 2,
    seatHeight: 0.59,
  },
  code: {
    label: 'Work at the desk',
    doing: 'At the keyboard',
    approach: { x: -2.05, z: -2.2 },
    anchor: { x: -2.8, z: -2.45 },
    facing: Math.PI,
    seatHeight: 0.52,
  },
  rest: {
    label: 'Take a quiet moment',
    doing: 'Taking a quiet moment',
    approach: { x: -2.76, z: 1.05 },
    anchor: { x: -3.4, z: 1.05 },
    facing: Math.PI / 2,
    seatHeight: 0.59,
  },
  window: {
    label: 'Watch the city',
    doing: 'Watching the city',
    approach: { x: 3.6, z: -0.65 },
    anchor: { x: 3.6, z: -0.65 },
    facing: Math.PI / 2,
  },
  stretch: {
    label: 'Stretch a little',
    doing: 'Stretching',
    approach: { x: 0.55, z: 0.65 },
    anchor: { x: 0.55, z: 0.65 },
    facing: 0,
  },
};
const sequence: RoomActivity[] = ['read', 'window', 'code', 'stretch', 'rest'];
const ease = (t: number) => t * t * (3 - 2 * t);
type Intent = { activity: RoomActivity } | { destination: RoomPoint };

/** Furniture has explicit approach points. Only the seating transition may enter its footprint. */
export class RoomActivityController {
  position: RoomPoint;
  facing = 0;
  phase: ActivityPhase = 'free';
  activity: RoomActivity | null = null;
  blend = 0;
  moving = false;
  elapsed = 0;
  private path: RoomPoint[] = [];
  private pending: Intent | null = null;
  private wait = 20;
  private next = 0;
  private autonomous = false;
  constructor(initial: RoomPoint) {
    this.position = { ...initial };
  }
  get label() {
    if (!this.activity) return this.moving ? 'Taking a walk' : 'Here with you';
    if (this.phase === 'walking')
      return `On her way · ${ROOM_ACTIVITIES[this.activity].label.toLowerCase()}`;
    if (this.phase === 'settling') return 'Getting comfortable';
    if (this.phase === 'leaving') return 'Getting up';
    return ROOM_ACTIVITIES[this.activity].doing;
  }
  private begin(intent: Intent) {
    const destination =
      'activity' in intent
        ? ROOM_ACTIVITIES[intent.activity].approach
        : intent.destination;
    const path = findRoomPath(this.position, destination);
    if (!path.length) return false;
    this.path = path;
    this.activity = 'activity' in intent ? intent.activity : null;
    this.phase = 'walking';
    this.blend = 0;
    this.elapsed = 0;
    return true;
  }
  private request(intent: Intent) {
    const destination =
      'activity' in intent
        ? ROOM_ACTIVITIES[intent.activity].approach
        : intent.destination;
    if (!canStand(destination)) return false;
    // Validate before interrupting a seated activity; an invalid floor tap never moves Nia.
    const from =
      this.activity && this.phase !== 'walking'
        ? ROOM_ACTIVITIES[this.activity].approach
        : this.position;
    if (!findRoomPath(from, destination).length) return false;
    this.wait = 90;
    if (
      this.activity &&
      (this.phase === 'active' ||
        this.phase === 'settling' ||
        this.phase === 'leaving')
    ) {
      this.pending = intent;
      this.phase = 'leaving';
      this.elapsed = 0;
      return true;
    }
    return this.begin(intent);
  }
  choose(activity: RoomActivity) {
    if (activity === this.activity && this.phase !== 'leaving') return true;
    return this.request({ activity });
  }
  walkTo(destination: RoomPoint) {
    return this.request({ destination: { ...destination } });
  }
  stop() {
    this.wait = 90;
    if (this.activity && this.phase !== 'walking') {
      this.pending = {
        destination: { ...ROOM_ACTIVITIES[this.activity].approach },
      };
      this.phase = 'leaving';
    } else {
      this.path = [];
      this.activity = null;
      this.phase = 'free';
      this.moving = false;
    }
  }
  steer(dx: number, dz: number, dt: number) {
    this.wait = 90;
    if (this.activity && this.phase !== 'walking') {
      this.stop();
      return;
    }
    this.path = [];
    this.phase = 'free';
    this.activity = null;
    const length = Math.hypot(dx, dz);
    if (!length) return;
    const distance = Math.min(Math.max(dt, 0), 0.05) * 1.05;
    const next = {
      x: this.position.x + (dx / length) * distance,
      z: this.position.z + (dz / length) * distance,
    };
    if (canStand(next)) {
      this.position = next;
      this.facing = Math.atan2(dx, dz);
      this.moving = true;
    }
  }
  tick(
    delta: number,
    options: { autonomy: boolean; blocked?: boolean; reduced?: boolean },
  ) {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 0.05) : 0;
    this.moving = false;
    this.elapsed += dt;
    if (!options.autonomy && this.autonomous && this.phase === 'walking')
      this.stop();
    this.autonomous = options.autonomy;
    if (this.phase === 'walking') {
      const next = this.path[0];
      if (next) {
        const dx = next.x - this.position.x,
          dz = next.z - this.position.z;
        const distance = Math.hypot(dx, dz),
          travel = options.reduced ? distance : dt * 1.05;
        if (distance > 0.001) this.facing = Math.atan2(dx, dz);
        if (distance <= travel + 0.001) {
          this.position = { ...next };
          this.path.shift();
        } else {
          this.position.x += (dx / distance) * travel;
          this.position.z += (dz / distance) * travel;
        }
        this.moving = !options.reduced && distance > 0.001;
      }
      if (!this.path.length) {
        this.phase = this.activity ? 'settling' : 'free';
        this.elapsed = 0;
      }
    }
    const place = this.activity ? ROOM_ACTIVITIES[this.activity] : null;
    if (place && (this.phase === 'settling' || this.phase === 'leaving')) {
      const speed = options.reduced ? 1 : dt / 1.8;
      this.blend =
        this.phase === 'settling'
          ? Math.min(1, this.blend + speed)
          : Math.max(0, this.blend - speed);
      const t = ease(this.blend);
      this.position.x =
        place.approach.x + (place.anchor.x - place.approach.x) * t;
      this.position.z =
        place.approach.z + (place.anchor.z - place.approach.z) * t;
      this.facing = place.facing;
      if (this.phase === 'settling' && this.blend === 1) {
        this.phase = 'active';
        this.elapsed = 0;
        this.wait = this.activity === 'stretch' ? 18 : 55 + this.next * 7;
      } else if (this.phase === 'leaving' && this.blend === 0) {
        this.activity = null;
        this.phase = 'free';
        const next = this.pending;
        this.pending = null;
        if (next) this.begin(next);
      }
    } else if (place && this.phase === 'active') this.facing = place.facing;
    if (
      options.autonomy &&
      !options.blocked &&
      !options.reduced &&
      (this.phase === 'free' || this.phase === 'active')
    ) {
      this.wait -= dt;
      if (this.wait <= 0) {
        let choice = sequence[this.next++ % sequence.length];
        if (choice === this.activity)
          choice = sequence[this.next++ % sequence.length];
        this.request({ activity: choice });
      }
    }
    return this;
  }
}
