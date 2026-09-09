'use client';
import { useEffect, useRef, useState } from 'react';
import { loadCompanion } from '@/lib/companion-avatar';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Zone } from '@/lib/entity-schema';
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
  const host = useRef<HTMLDivElement>(null),
    fallback = useRef<HTMLParagraphElement>(null),
    latest = useRef({ zone, busy, greeting, onMove, paused });
  useEffect(() => {
    latest.current = { zone, busy, greeting, onMove, paused };
  }, [zone, busy, greeting, onMove, paused]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      if (fallback.current) fallback.current.hidden = false;
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f6f3fb');
    scene.fog = new THREE.Fog('#f6f3fb', 16, 38);
    const camera = new THREE.PerspectiveCamera(compact ? 34 : 37, 1, 0.1, 100);
    camera.position.set(
      compact ? 3.8 : 7.5,
      compact ? 3.2 : 5.6,
      compact ? 7.5 : 11,
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.55, 0);
    controls.enableDamping = true;
    controls.minDistance = compact ? 6 : 8;
    controls.maxDistance = 21;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.enablePan = false;
    scene.add(new THREE.HemisphereLight('#ffffff', '#968ea7', 2.2));
    const light = new THREE.DirectionalLight('#fff1da', 2.7);
    light.position.set(3, 10, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -9;
    light.shadow.camera.right = 9;
    light.shadow.camera.top = 9;
    light.shadow.camera.bottom = -9;
    light.shadow.bias = -0.0005;
    scene.add(light);
    const paper = new THREE.MeshStandardMaterial({
      color: '#eeebf5',
      roughness: 0.94,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), paper);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.055;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(40, 80, '#d8d0e8', '#e7e2f2');
    grid.position.y = -0.045;
    scene.add(grid);
    const zones: Record<Zone, THREE.Vector3> = {
      center: new THREE.Vector3(0, 0, 0),
      desk: new THREE.Vector3(-3.4, 0, -1),
      window: new THREE.Vector3(3.4, 0, -1.5),
    };
    const targets: THREE.Object3D[] = [];
    for (const [name, position] of Object.entries(zones)) {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 0.035, 64),
        new THREE.MeshStandardMaterial({
          color: name === 'center' ? '#e6dcfb' : '#ece8f5',
          roughness: 0.9,
        }),
      );
      pad.position.copy(position);
      pad.userData.zone = name;
      pad.receiveShadow = true;
      targets.push(pad);
      scene.add(pad);
      const circle = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from(
            { length: 80 },
            (_, i) =>
              new THREE.Vector3(
                Math.cos((i / 80) * Math.PI * 2) * 1.22,
                0.028,
                Math.sin((i / 80) * Math.PI * 2) * 1.22,
              ),
          ),
        ),
        new THREE.LineBasicMaterial({ color: '#c7b6e8' }),
      );
      circle.position.copy(position);
      scene.add(circle);
    }
    const agent = new THREE.Group();
    scene.add(agent);
    agent.position.copy(zones[latest.current.zone]);
    let disposed = false;
    let companion: Awaited<ReturnType<typeof loadCompanion>> | undefined;
    let greetingUntil = 0;
    let lastGreeting = latest.current.greeting;
    void loadCompanion()
      .then((loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        companion = loaded;
        agent.add(loaded.body);
        greetingUntil = performance.now() + 4700;
        setModelState('ready');
      })
      .catch(() => {
        if (!disposed) setModelState('error');
      });
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.64, 0.013, 8, 80),
      new THREE.MeshBasicMaterial({
        color: '#7f47ef',
        transparent: true,
        opacity: 0.5,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.045;
    agent.add(halo);
    const desk = new THREE.Group();
    desk.position.set(-3.4, 0, -2.2);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.1, 0.9),
      new THREE.MeshStandardMaterial({ color: '#e3ddef', roughness: 0.8 }),
    );
    top.position.y = 1.12;
    top.castShadow = true;
    desk.add(top);
    for (const x of [-0.75, 0.75])
      for (const z of [-0.32, 0.32]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 1.12, 8),
          new THREE.MeshStandardMaterial({ color: '#9485b2' }),
        );
        leg.position.set(x, 0.56, z);
        desk.add(leg);
      }
    scene.add(desk);
    const frameGeometry = new THREE.BoxGeometry(1.8, 2.4, 0.07);
    const windowFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(frameGeometry),
      new THREE.LineBasicMaterial({ color: '#a593ca' }),
    );
    windowFrame.position.set(3.4, 1.75, -3);
    scene.add(windowFrame);
    const start = new THREE.Vector2();
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const down = (e: PointerEvent) => start.set(e.clientX, e.clientY);
    const up = (e: PointerEvent) => {
      if (start.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(targets)[0];
      if (hit && latest.current.onMove)
        latest.current.onMove(hit.object.userData.zone as Zone);
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    const resize = () => {
      const w = element.clientWidth,
        h = element.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let frame = 0,
      last = performance.now(),
      t = 0;
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    visibility.observe(element);
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!document.hidden && visible) {
        const reduced = motionPreference.matches || latest.current.paused;
        t += dt;
        const target = zones[latest.current.zone];
        const distance = agent.position.distanceTo(target);
        if (reduced) agent.position.copy(target);
        else agent.position.lerp(target, 1 - Math.exp(-dt * 3));
        if (latest.current.greeting !== lastGreeting) {
          lastGreeting = latest.current.greeting;
          greetingUntil = now + 4700;
        }
        const moving = distance > 0.06;
        const look = moving ? target : camera.position;
        const yaw = Math.atan2(
          look.x - agent.position.x,
          look.z - agent.position.z,
        );
        const turn = Math.atan2(
          Math.sin(yaw - agent.rotation.y),
          Math.cos(yaw - agent.rotation.y),
        );
        agent.rotation.y += reduced ? turn : turn * (1 - Math.exp(-dt * 7));
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
        );
        halo.material.opacity =
          latest.current.busy && !reduced ? 0.65 + Math.sin(t * 5) * 0.2 : 0.4;
        controls.update();
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      if (companion) {
        agent.remove(companion.body);
        companion.dispose();
      }
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [compact, attempt]);
  return (
    <div className="agent-world" ref={host}>
      {modelState !== 'ready' && (
        <output className="character-loading">
          <span>
            {modelState === 'loading'
              ? 'Your companion is arriving…'
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
        3D is unavailable on this device. Use the location buttons to move your
        companion; memory and actions still work.
      </p>
    </div>
  );
}
