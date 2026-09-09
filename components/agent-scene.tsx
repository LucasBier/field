'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCompanion } from '@/lib/companion-avatar';
import {
  createStudioRoom,
  type RoomAction,
  type RoomSettings,
  type RoomLight,
} from '@/lib/studio-room';
import { createRoomAudio } from '@/lib/room-audio';
import {
  ROOM_LOCATIONS,
  ROOM_BOUNDS,
  nearestZone,
  type RoomPoint,
} from '@/lib/room-navigation';
import {
  RoomActivityController,
  ROOM_ACTIVITIES,
  type RoomActivity,
} from '@/lib/room-activities';
import type { Zone } from '@/lib/entity-schema';

type View = 'room' | 'close' | 'follow';
export default function AgentScene({
  zone = 'center',
  busy = false,
  greeting = 0,
  onMove,
  compact = false,
  paused = false,
}: {
  zone?: Zone;
  busy?: boolean;
  greeting?: number;
  onMove?: (z: Zone) => void;
  compact?: boolean;
  paused?: boolean;
}) {
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<RoomSettings>({
    light: 'sunset',
    lamp: true,
    curtains: false,
    music: false,
  });
  const [view, setView] = useState<View>(compact ? 'close' : 'room');
  const [notice, setNotice] = useState('');
  const [autonomy, setAutonomy] = useState(true);
  const [activityLabel, setActivityLabel] = useState('Here with you');
  const [activity, setActivity] = useState<RoomActivity | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const fallback = useRef<HTMLParagraphElement>(null);
  const latest = useRef({
    zone,
    busy,
    greeting,
    onMove,
    paused,
    settings,
    view,
    autonomy,
  });
  const commands = useRef<{
    view: (v: View) => void;
    action: (a: RoomAction) => void;
    activity: (a: RoomActivity) => void;
    stop: () => void;
    greet: () => void;
  } | null>(null);
  useEffect(() => {
    latest.current = {
      zone,
      busy,
      greeting,
      onMove,
      paused,
      settings,
      view,
      autonomy,
    };
  }, [zone, busy, greeting, onMove, paused, settings, view, autonomy]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      if (fallback.current) fallback.current.hidden = false;
      queueMicrotask(() => setModelState('error'));
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.5 : 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute(
      'aria-label',
      'Explore Nia’s room. Drag to look around and select the floor to walk.',
    );
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const room = createStudioRoom(scene, renderer);
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(studio, 0.04);
    scene.environment = environment.texture;
    studio.dispose();
    pmrem.dispose();
    room.setSettings(latest.current.settings);
    const camera = new THREE.PerspectiveCamera(compact ? 36 : 42, 1, 0.05, 80);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minPolarAngle = 0.18;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.panSpeed = 0.6;
    controls.zoomSpeed = 0.75;
    const agent = new THREE.Group();
    scene.add(agent);
    const initial = ROOM_LOCATIONS[latest.current.zone];
    agent.position.set(initial.x, 0.015, initial.z);
    const behavior = new RoomActivityController(initial);
    let narrow = element.clientWidth < 700;
    function frameView(v: View) {
      const p = agent.position;
      if (v === 'room') {
        if (narrow) {
          camera.position.set(p.x + 2.7, 2.7, p.z + 4.0);
          controls.target.set(p.x, 0.9, p.z);
        } else {
          camera.position.set(8.5, 6.5, 10.5);
          controls.target.set(0, 0.7, -0.3);
        }
      } else if (v === 'close') {
        const face = new THREE.Vector3(0.32, 0, 1.7).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          agent.rotation.y,
        );
        camera.position.set(p.x + face.x, p.y + 1.5, p.z + face.z);
        controls.target.set(p.x, p.y + 1.3, p.z);
      } else {
        camera.position.set(p.x + 1.2, 1.62, p.z + 3.7);
        controls.target.set(p.x, 0.95, p.z);
      }
      controls.update();
    }
    frameView(latest.current.view);
    const audio = createRoomAudio();
    let soundPlaying = false;
    const act = (action: RoomAction) => {
      if (action === 'record') {
        soundPlaying = !soundPlaying;
        setSettings((s) => ({ ...s, music: soundPlaying }));
        if (soundPlaying)
          void audio.play().catch(() => {
            soundPlaying = false;
            setSettings((s) => ({ ...s, music: false }));
            setNotice('Sound could not start on this device.');
          });
        else audio.pause();
      } else setSettings((s) => ({ ...s, [action]: !s[action] }));
    };

    let disposed = false;
    const request = new AbortController();
    let companion: Awaited<ReturnType<typeof loadCompanion>> | undefined;
    let greetingUntil = 0,
      lastGreeting = latest.current.greeting;
    void loadCompanion(request.signal)
      .then((loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        companion = loaded;
        if (loaded.body.userData.geometry !== 'glb')
          loaded.body.scale.setScalar(0.55);
        agent.add(loaded.body);
        greetingUntil = performance.now() + 3500;
        setModelState('ready');
      })
      .catch(() => {
        if (!disposed) setModelState('error');
      });
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.15, 48),
      new THREE.MeshBasicMaterial({
        color: '#8258bf',
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.04;
    marker.visible = false;
    scene.add(marker);
    let lastZone = latest.current.zone;
    let ownZone: Zone | undefined;
    let markUntil = 0;
    const walkTo = (destination: RoomPoint, report = true) => {
      if (!behavior.walkTo(destination)) {
        setNotice('Choose an open place on the floor.');
        return;
      }
      marker.position.set(destination.x, 0.04, destination.z);
      marker.visible = true;
      markUntil = performance.now() + 5000;
      setNotice('');
      if (report) {
        const reported = nearestZone(destination);
        ownZone = reported === lastZone ? undefined : reported;
        latest.current.onMove?.(reported);
      }
    };
    const chooseActivity = (next: RoomActivity) => {
      if (behavior.choose(next)) {
        setNotice('');
        marker.visible = false;
        if (latest.current.view === 'close') {
          setView('follow');
          frameView('follow');
        }
      } else
        setNotice(
          'Nia could not find a clear way there. Try an open place first.',
        );
    };
    commands.current = {
      view: frameView,
      action: act,
      activity: chooseActivity,
      stop: () => behavior.stop(),
      greet: () => {
        greetingUntil = performance.now() + 3500;
      },
    };
    const pointerStart = new THREE.Vector2(),
      pointer = new THREE.Vector2(),
      ray = new THREE.Raycaster();
    let pointers = 0,
      multiGesture = false;
    const down = (event: PointerEvent) => {
      pointers++;
      if (pointers > 1) multiGesture = true;
      pointerStart.set(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      const wasMultiple = multiGesture;
      pointers = Math.max(0, pointers - 1);
      if (!pointers) multiGesture = false;
      if (
        wasMultiple ||
        event.button !== 0 ||
        pointerStart.distanceTo(
          new THREE.Vector2(event.clientX, event.clientY),
        ) > 6
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects([room.root], true).filter((h) => {
        if (!h.object.visible || !(h.object instanceof THREE.Mesh))
          return false;
        const materials = Array.isArray(h.object.material)
          ? h.object.material
          : [h.object.material];
        return materials.some((m) => m.opacity >= 0.2);
      });
      const first = hits[0];
      if (first?.object.userData.niaActivity)
        chooseActivity(first.object.userData.niaActivity as RoomActivity);
      else if (first?.object.userData.roomAction)
        act(first.object.userData.roomAction as RoomAction);
      else {
        const floorHit = ray.intersectObject(room.floor)[0];
        if (
          floorHit &&
          (!first ||
            first.object.userData.walkSurface ||
            first.point.y < 0.08 ||
            first.distance >= floorHit.distance - 0.12)
        )
          walkTo(floorHit.point);
      }
    };
    const cancel = () => {
      pointers = 0;
      multiGesture = false;
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointercancel', cancel);
    const keys = new Set<string>();
    const keydown = (event: KeyboardEvent) => {
      if (
        document.activeElement !== renderer.domElement ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowleft',
          'arrowdown',
          'arrowright',
        ].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        keys.add(event.key.toLowerCase());
      }
    };
    const keyup = (event: KeyboardEvent) => {
      const wasMoving = keys.delete(event.key.toLowerCase());
      if (wasMoving && !keys.size) {
        const reported = nearestZone(agent.position);
        ownZone = reported === lastZone ? undefined : reported;
        latest.current.onMove?.(reported);
      }
    };
    const blur = () => keys.clear();
    renderer.domElement.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    const hidden = () => {
      keys.clear();
      if (document.hidden) {
        audio.pause();
        soundPlaying = false;
        setSettings((s) => ({ ...s, music: false }));
      }
    };
    document.addEventListener('visibilitychange', hidden);
    const resize = () => {
      const w = element.clientWidth,
        h = element.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const nextNarrow = w < 700;
      if (nextNarrow !== narrow) {
        narrow = nextNarrow;
        frameView(latest.current.view);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let visible = false;
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    visibility.observe(element);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      last = performance.now(),
      appliedSettings = latest.current.settings;
    const priorPosition = new THREE.Vector3(),
      direction = new THREE.Vector3(),
      cameraForward = new THREE.Vector3();
    let shownLabel = '',
      shownActivity: RoomActivity | null = null;
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!document.hidden && visible) {
        const reduced = motion.matches || latest.current.paused;
        if (appliedSettings !== latest.current.settings) {
          appliedSettings = latest.current.settings;
          room.setSettings(appliedSettings);
        }
        if (latest.current.zone !== lastZone) {
          lastZone = latest.current.zone;
          if (lastZone === ownZone) ownZone = undefined;
          else walkTo(ROOM_LOCATIONS[lastZone], false);
        }
        priorPosition.copy(agent.position);
        const horizontal =
          Number(keys.has('d') || keys.has('arrowright')) -
          Number(keys.has('a') || keys.has('arrowleft'));
        const vertical =
          Number(keys.has('w') || keys.has('arrowup')) -
          Number(keys.has('s') || keys.has('arrowdown'));
        behavior.tick(dt, {
          autonomy: !compact && !!companion && latest.current.autonomy,
          blocked: latest.current.busy || !!horizontal || !!vertical,
          reduced,
        });
        if ((horizontal || vertical) && !reduced) {
          camera.getWorldDirection(cameraForward);
          cameraForward.y = 0;
          cameraForward.normalize();
          direction
            .set(-cameraForward.z, 0, cameraForward.x)
            .multiplyScalar(horizontal)
            .addScaledVector(cameraForward, vertical)
            .normalize();
          behavior.steer(direction.x, direction.z, dt);
        }
        agent.position.set(behavior.position.x, 0.015, behavior.position.z);
        const moving = behavior.moving;
        const activeActivity =
          behavior.activity && behavior.phase !== 'walking'
            ? behavior.activity
            : null;
        if (behavior.label !== shownLabel) {
          shownLabel = behavior.label;
          setActivityLabel(shownLabel);
        }
        if (behavior.activity !== shownActivity) {
          shownActivity = behavior.activity;
          setActivity(shownActivity);
        }
        if (latest.current.greeting !== lastGreeting) {
          lastGreeting = latest.current.greeting;
          greetingUntil = now + 3500;
        }
        const yaw =
          moving || activeActivity
            ? behavior.facing
            : Math.atan2(
                camera.position.x - agent.position.x,
                camera.position.z - agent.position.z,
              );
        const turn = Math.atan2(
          Math.sin(yaw - agent.rotation.y),
          Math.cos(yaw - agent.rotation.y),
        );
        agent.rotation.y += reduced ? turn : turn * (1 - Math.exp(-dt * 6));
        companion?.update(
          dt,
          moving
            ? 'walk'
            : latest.current.busy
              ? 'think'
              : now < greetingUntil
                ? 'wave'
                : 'idle',
          reduced,
          activeActivity
            ? {
                activity: activeActivity,
                blend: behavior.blend,
                seatHeight: ROOM_ACTIVITIES[activeActivity].seatHeight,
                time: behavior.elapsed,
                transitioning:
                  behavior.phase === 'settling' || behavior.phase === 'leaving',
              }
            : undefined,
        );
        if (
          latest.current.view === 'follow' ||
          (narrow && latest.current.view === 'room')
        ) {
          const delta = agent.position.clone().sub(priorPosition);
          camera.position.add(delta);
          controls.target.add(delta);
        }
        const b = ROOM_BOUNDS;
        controls.target.x = THREE.MathUtils.clamp(
          controls.target.x,
          b.minX,
          b.maxX,
        );
        controls.target.z = THREE.MathUtils.clamp(
          controls.target.z,
          b.minZ,
          b.maxZ,
        );
        controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0.3, 2.5);
        marker.visible =
          now < markUntil && behavior.phase === 'walking' && !behavior.activity;
        controls.update();
        room.setActivity(activeActivity);
        room.update(dt, camera, reduced);
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      request.abort();
      commands.current = null;
      cancelAnimationFrame(frame);
      audio.dispose();
      observer.disconnect();
      visibility.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('pointercancel', cancel);
      renderer.domElement.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
      companion?.dispose();
      room.dispose();
      marker.geometry.dispose();
      marker.material.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [compact, attempt]);
  const selectView = (next: View) => {
    setView(next);
    commands.current?.view(next);
  };
  return (
    <div className={`agent-world${compact ? ' agent-world-compact' : ''}`}>
      <div className="scene-viewport" ref={host}>
        {modelState !== 'ready' && (
          <output className="character-loading">
            <span>
              {modelState === 'loading'
                ? 'Preparing Nia’s room…'
                : 'Her 3D appearance could not load.'}
            </span>
            {modelState === 'error' && (
              <button
                onClick={() => {
                  setModelState('loading');
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
            )}
          </output>
        )}
        <p className="world-fallback" hidden ref={fallback}>
          3D is unavailable on this device. Memory and conversations are still
          available.
        </p>
      </div>
      {!compact && (
        <div className="room-controls" aria-label="Room controls">
          <div className="room-activity-bar">
            <output className="room-activity-status" aria-live="polite">
              {activityLabel}
            </output>
            <label className="room-autonomy">
              <input
                type="checkbox"
                checked={autonomy}
                onChange={(e) => setAutonomy(e.target.checked)}
              />
              Let Nia choose
            </label>
          </div>
          <div className="room-activity-actions">
            <label className="sr-only" htmlFor="nia-activity">
              Nia’s activity
            </label>
            <select
              id="nia-activity"
              value={activity ?? ''}
              disabled={modelState !== 'ready'}
              onChange={(e) =>
                e.target.value
                  ? commands.current?.activity(e.target.value as RoomActivity)
                  : commands.current?.stop()
              }
            >
              <option value="">Take a walk</option>
              {(Object.keys(ROOM_ACTIVITIES) as RoomActivity[]).map((id) => (
                <option value={id} key={id}>
                  {ROOM_ACTIVITIES[id].label}
                </option>
              ))}
            </select>
            <button
              disabled={modelState !== 'ready'}
              onClick={() => commands.current?.greet()}
            >
              Wave hello
            </button>
          </div>
          <details className="room-options">
            <summary>Light, sound & view</summary>
            <div className="room-control-group" aria-label="Light">
              {(['day', 'sunset', 'night'] as RoomLight[]).map((light) => (
                <button
                  key={light}
                  aria-pressed={settings.light === light}
                  onClick={() => setSettings((s) => ({ ...s, light }))}
                >
                  {light === 'sunset'
                    ? 'Golden hour'
                    : light === 'day'
                      ? 'Daylight'
                      : 'Night'}
                </button>
              ))}
            </div>
            <div className="room-control-group" aria-label="View">
              {(['room', 'close', 'follow'] as View[]).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={view === mode}
                  onClick={() => selectView(mode)}
                >
                  {mode === 'room'
                    ? 'Room'
                    : mode === 'close'
                      ? 'Portrait'
                      : 'Follow'}
                </button>
              ))}
            </div>
            <div className="room-control-group" aria-label="Objects">
              <button
                aria-pressed={settings.lamp}
                onClick={() => commands.current?.action('lamp')}
              >
                Lamp
              </button>
              <button
                aria-pressed={settings.curtains}
                onClick={() => commands.current?.action('curtains')}
              >
                Curtains
              </button>
              <button
                aria-pressed={settings.music}
                onClick={() => commands.current?.action('record')}
              >
                {settings.music ? 'Pause record' : 'Play record'}
              </button>
            </div>
            <p className="room-instruction">
              Select the floor to walk. Drag to explore.
            </p>
          </details>
          {notice && <output className="room-notice">{notice}</output>}
        </div>
      )}
    </div>
  );
}
