'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRAY, type DeskWorld } from '@/lib/desk';

export default function DeskScene({ world }: { world: DeskWorld }) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(world);
  useEffect(() => {
    latest.current = world;
  }, [world]);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      element.textContent =
        'This device cannot display the desk. Task controls and records are still available.';
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setClearColor('#eeebf6');
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive virtual desk. Drag to orbit and scroll to zoom.',
    );
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
    camera.position.set(2.65, 3.1, 3.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.12, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 6;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2.2;
    const environment = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(environment, 0.04);
    scene.environment = env.texture;
    environment.dispose();
    pmrem.dispose();
    const materials: THREE.Material[] = [];
    function material(color: string, roughness = 0.5, metalness = 0) {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.push(m);
      return m;
    }
    const ivory = material('#fcfaf5', 0.7),
      silver = material('#aaa7b6', 0.32, 0.7),
      purple = material('#7046cf', 0.3, 0.25),
      dark = material('#393344', 0.5);
    function mesh(
      geometry: THREE.BufferGeometry,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) {
      const o = new THREE.Mesh(geometry, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }
    mesh(new THREE.BoxGeometry(2.65, 0.1, 1.85), ivory, 0, -0.07, 0);
    mesh(
      new THREE.BoxGeometry(2.45, 0.1, 1.65),
      material('#d7d0e5'),
      0,
      -0.16,
      0,
    );
    const floor = mesh(
      new THREE.PlaneGeometry(200, 200),
      material('#eeebf6', 1),
      0,
      -0.22,
      0,
    );
    floor.rotation.x = -Math.PI / 2;
    const tray = new THREE.Group();
    tray.position.set(TRAY.x, 0, TRAY.z);
    scene.add(tray);
    const trayMaterial = material('#cebee9', 0.55);
    mesh(
      new THREE.BoxGeometry(TRAY.width, 0.035, TRAY.depth),
      trayMaterial,
      0,
      0,
      0,
      tray,
    );
    for (const x of [-1, 1])
      mesh(
        new THREE.BoxGeometry(0.018, 0.07, TRAY.depth),
        trayMaterial,
        (x * TRAY.width) / 2,
        0.035,
        0,
        tray,
      );
    for (const z of [-1, 1])
      mesh(
        new THREE.BoxGeometry(TRAY.width, 0.07, 0.018),
        trayMaterial,
        0,
        0.035,
        (z * TRAY.depth) / 2,
        tray,
      );
    const objects = new Map<string, THREE.Group>();
    for (const o of latest.current.objects) {
      const cup = new THREE.Group(),
        m = material(o.color, 0.24);
      const points = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.066, 0),
        new THREE.Vector2(0.087, 0.18),
        new THREE.Vector2(0.076, 0.18),
        new THREE.Vector2(0.057, 0.016),
        new THREE.Vector2(0, 0.016),
      ];
      mesh(new THREE.LatheGeometry(points, 48), m, 0, 0.02, 0, cup);
      const handle = mesh(
        new THREE.TorusGeometry(0.043, 0.012, 12, 32),
        m,
        0.092,
        0.115,
        0,
        cup,
      );
      handle.scale.set(0.8, 1, 1);
      cup.position.set(o.x, o.y, o.z);
      scene.add(cup);
      objects.set(o.id, cup);
    }
    for (const x of [-1.05, 1.05])
      mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.12, 24),
        silver,
        x,
        0.54,
        -0.7,
      );
    mesh(new THREE.BoxGeometry(2.18, 0.055, 0.055), silver, 0, 1.08, -0.7);
    const carriage = mesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.13),
      purple,
      0,
      1.08,
      -0.7,
    );
    const boom = mesh(
      new THREE.BoxGeometry(0.034, 0.034, 1),
      silver,
      0,
      1.06,
      -0.2,
    );
    const wire = mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 1, 16),
      dark,
      0,
      0.7,
      0,
    );
    const grip = new THREE.Group();
    scene.add(grip);
    mesh(new THREE.BoxGeometry(0.18, 0.08, 0.09), purple, 0, 0.09, 0, grip);
    const fingers = [-1, 1].map((side) =>
      mesh(
        new THREE.BoxGeometry(0.018, 0.12, 0.055),
        silver,
        side * 0.12,
        0,
        0,
        grip,
      ),
    );
    grip.position.copy(latest.current.gripper);
    scene.add(new THREE.HemisphereLight('#ffffff', '#a39ab6', 2));
    const light = new THREE.DirectionalLight('#fff6e4', 4.5);
    light.position.set(-3, 5, 3);
    light.castShadow = true;
    light.shadow.mapSize.set(1536, 1536);
    light.shadow.camera.left = -3;
    light.shadow.camera.right = 3;
    light.shadow.camera.top = 3;
    light.shadow.camera.bottom = -3;
    light.shadow.bias = -0.001;
    scene.add(light);
    const resize = new ResizeObserver(() => {
      const w = element.clientWidth,
        h = element.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resize.observe(element);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      previous = performance.now();
    function draw(now: number) {
      const dt = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const blend = reduced.matches ? 1 : 1 - Math.exp(-dt * 6);
      const state = latest.current;
      for (const o of state.objects)
        objects
          .get(o.id)
          ?.position.lerp(new THREE.Vector3(o.x, o.y, o.z), blend);
      grip.position.lerp(
        new THREE.Vector3(state.gripper.x, state.gripper.y, state.gripper.z),
        blend,
      );
      carriage.position.x = grip.position.x;
      boom.position.x = grip.position.x;
      boom.position.z = (grip.position.z - 0.7) / 2;
      boom.scale.z = Math.max(0.08, grip.position.z + 0.7);
      wire.position.set(
        grip.position.x,
        (1.04 + grip.position.y) / 2,
        grip.position.z,
      );
      wire.scale.y = Math.max(0.05, 1.04 - grip.position.y);
      fingers.forEach((f, i) => {
        f.position.x = (i ? 1 : -1) * (state.gripper.holding ? 0.085 : 0.12);
      });
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      env.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div className="desk-canvas" ref={host} />;
}
