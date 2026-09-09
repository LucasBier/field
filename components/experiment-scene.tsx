'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { displacement, type Experiment } from '@/lib/field';
export default function ExperimentScene({
  experiments,
  playing,
  resetKey,
}: {
  experiments: Experiment[];
  playing: boolean;
  resetKey: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ experiments, playing });
  useEffect(() => {
    latest.current = { experiments, playing };
  }, [experiments, playing]);
  const time = useRef(0);
  const fallback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    time.current = 0;
  }, [resetKey]);
  const signature = experiments.map((e) => e.id + e.kind).join('|');
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      if (fallback.current) fallback.current.hidden = false;
      return;
    }
    const element = host.current;
    if (fallback.current) fallback.current.hidden = true;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10151e');
    scene.fog = new THREE.Fog('#10151e', 12, 30);
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 80);
    camera.position.set(5.1, 3.8, 8.7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.55, 0);
    controls.enableDamping = true;
    controls.minDistance = 4;
    controls.maxDistance = 17;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    scene.add(new THREE.HemisphereLight('#e8e9ff', '#273244', 2.5));
    const light = new THREE.DirectionalLight('#ffffff', 3);
    light.position.set(3, 7, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -6;
    light.shadow.camera.right = 6;
    scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#151c27', roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(40, 80, '#3f485d', '#283143');
    grid.position.y = -0.04;
    scene.add(grid);
    const systems = latest.current.experiments.map((e, i, all) => {
      const group = new THREE.Group();
      group.position.x = all.length === 1 ? 0 : (i - 0.5) * 3.5;
      scene.add(group);
      const metal = new THREE.MeshStandardMaterial({
        color: '#778397',
        metalness: 0.75,
        roughness: 0.35,
      });
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 3.25),
        metal,
      );
      stand.position.set(-1.05, 1.625, 0);
      stand.castShadow = true;
      group.add(stand);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 1.15),
        metal,
      );
      beam.rotation.z = Math.PI / 2;
      beam.position.set(-0.52, 3.25, 0);
      beam.castShadow = true;
      group.add(beam);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.8), metal);
      base.position.set(-1.05, 0.02, 0);
      base.castShadow = true;
      group.add(base);
      const bob = new THREE.Mesh(
        e.kind === 'pendulum'
          ? new THREE.SphereGeometry(0.22, 32, 24)
          : new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({
          color: e.color,
          metalness: 0.35,
          roughness: 0.23,
        }),
      );
      bob.castShadow = true;
      group.add(bob);
      const count = e.kind === 'spring' ? 180 : 2;
      const vertices = new Float32Array(count * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      const cord = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: '#d8d8e7' }),
      );
      cord.frustumCulled = false;
      group.add(cord);
      const trailVertices = new Float32Array(100 * 3);
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(trailVertices, 3),
      );
      const trail = new THREE.Line(
        trailGeometry,
        new THREE.LineBasicMaterial({
          color: e.color,
          transparent: true,
          opacity: 0.3,
        }),
      );
      trail.frustumCulled = false;
      group.add(trail);
      return {
        bob,
        cord,
        vertices,
        trailVertices,
        trailGeometry,
        count,
        history: [] as THREE.Vector3[],
      };
    });
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
      last = performance.now();
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (latest.current.playing && !document.hidden) time.current += dt;
      systems.forEach((s, i) => {
        const e = latest.current.experiments[i];
        if (!e) return;
        const q = displacement(e, time.current);
        const x = e.kind === 'pendulum' ? Math.sin(q) * e.params.length : 0;
        const y =
          e.kind === 'pendulum'
            ? 3.25 - Math.cos(q) * e.params.length
            : 1.65 + q;
        s.bob.position.set(x, y, 0);
        for (let j = 0; j < s.count; j++) {
          const t = j / (s.count - 1);
          s.vertices[j * 3] =
            e.kind === 'spring' ? Math.sin(t * Math.PI * 24) * 0.13 : x * t;
          s.vertices[j * 3 + 1] =
            3.25 + ((e.kind === 'spring' ? y + 0.25 : y) - 3.25) * t;
          s.vertices[j * 3 + 2] =
            e.kind === 'spring' ? Math.cos(t * Math.PI * 24) * 0.13 : 0;
        }
        s.cord.geometry.attributes.position.needsUpdate = true;
        if (latest.current.playing || !s.history.length) {
          s.history.push(new THREE.Vector3(x, y, 0));
          if (s.history.length > 100) s.history.shift();
        }
        for (let j = 0; j < 100; j++) {
          const point = s.history[Math.min(j, s.history.length - 1)];
          s.trailVertices.set([point.x, point.y, point.z], j * 3);
        }
        s.trailGeometry.attributes.position.needsUpdate = true;
      });
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [signature]);
  return (
    <figure
      className="scene-canvas"
      ref={host}
      aria-label="Interactive three-dimensional experiment. Drag to orbit and scroll to zoom."
    >
      <p ref={fallback} hidden className="scene-fallback">
        3D rendering is unavailable on this device. Parameters, calculations,
        and comparisons still work.
      </p>
    </figure>
  );
}
