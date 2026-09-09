import * as THREE from 'three';
import type { RoomActivity } from './room-activities';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { disposeModel } from './companion-model';

export type RoomLight = 'day' | 'sunset' | 'night';
export type RoomAction = 'lamp' | 'curtains' | 'record';
export type RoomSettings = {
  light: RoomLight;
  lamp: boolean;
  curtains: boolean;
  music: boolean;
};

const PALETTES = {
  day: {
    sky: '#c7d9e2',
    haze: '#e8e3db',
    sun: '#fff4df',
    power: 3.2,
    ambient: 0.75,
    exposure: 1.04,
  },
  sunset: {
    sky: '#b5a6c3',
    haze: '#e8baa2',
    sun: '#ffd5a5',
    power: 2.8,
    ambient: 0.55,
    exposure: 1.08,
  },
  night: {
    sky: '#151b35',
    haze: '#282b4b',
    sun: '#a0baff',
    power: 0.35,
    ambient: 0.24,
    exposure: 1.2,
  },
};

export function createStudioRoom(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
) {
  const root = new THREE.Group();
  root.name = 'Nia apartment';
  scene.add(root);
  const pickables: THREE.Object3D[] = [];
  const loader = new THREE.TextureLoader();
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  function surface(color: string, roughness = 0.75, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }
  function map(name: string, color = false, repeat = 1) {
    const t = loader.load(`/environment/studio/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    parent: THREE.Object3D = root,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    position: [number, number, number],
    radius = 0.02,
    parent: THREE.Object3D = root,
  ) {
    const key = `${w}/${h}/${d}/${radius}`;
    if (!geometryCache.has(key))
      geometryCache.set(
        key,
        new RoundedBoxGeometry(
          w,
          h,
          d,
          2,
          Math.min(radius, w / 3, h / 3, d / 3),
        ),
      );
    return mesh(geometryCache.get(key)!, material, position, parent);
  }
  function cylinder(
    top: number,
    bottom: number,
    height: number,
    material: THREE.Material,
    position: [number, number, number],
    parent: THREE.Object3D = root,
  ) {
    return mesh(
      new THREE.CylinderGeometry(top, bottom, height, 24),
      material,
      position,
      parent,
    );
  }
  function tube(
    points: THREE.Vector3[],
    radius: number,
    material: THREE.Material,
    parent: THREE.Object3D = root,
  ) {
    return mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        20,
        radius,
        8,
        false,
      ),
      material,
      [0, 0, 0],
      parent,
    );
  }
  function interactive(object: THREE.Object3D, action: RoomAction) {
    object.traverse((part) => {
      part.userData.roomAction = action;
    });
    pickables.push(object);
  }
  const oak = new THREE.MeshStandardMaterial({
    color: '#b69573',
    roughness: 0.65,
    map: map('wood-color', true, 3),
    normalMap: map('wood-normal', false, 3),
    roughnessMap: map('wood-roughness', false, 3),
  });
  oak.normalScale.set(0.4, 0.4);
  const plaster = new THREE.MeshStandardMaterial({
    color: '#e9e0cf',
    roughness: 0.92,
    map: map('plaster-color', true, 2),
    normalMap: map('plaster-normal', false, 2),
    roughnessMap: map('plaster-roughness', false, 2),
    transparent: true,
  });
  plaster.normalScale.set(0.3, 0.3);
  const walnut = surface('#50372c', 0.54),
    brass = surface('#b89a58', 0.3, 0.8),
    black = surface('#28262b', 0.48);
  const cream = surface('#e7dfcf', 0.96),
    green = surface('#71806e', 0.93),
    violet = surface('#756188', 0.9),
    paper = surface('#ddd4bf', 0.98);
  const floor = box(10, 0.16, 8, oak, [0, -0.08, 0], 0.015);
  floor.name = 'Walkable floor';
  const baseboard = surface('#9a8069', 0.65);
  const backMaterial = plaster.clone(),
    leftMaterial = plaster.clone();
  box(10, 3.6, 0.16, backMaterial, [0, 1.8, -4.05]);
  box(0.16, 3.6, 8, leftMaterial, [-5.05, 1.8, 0]);
  box(10, 0.13, 0.05, baseboard, [0, 0.065, -3.95]);
  box(0.05, 0.13, 8, baseboard, [-4.95, 0.065, 0]);
  // Window mullions cast the long afternoon shadows across the oak floor.
  const windowMaterial = surface('#4b4748', 0.42, 0.25);
  for (const z of [-4, -2, 0, 2, 4])
    box(0.08, 3.5, 0.065, windowMaterial, [4.96, 1.75, z]);
  for (const y of [0.15, 1.18, 3.5])
    box(0.08, 0.06, 8, windowMaterial, [4.96, y, 0]);
  const glass = mesh(
    new THREE.PlaneGeometry(8, 3.35),
    new THREE.MeshPhysicalMaterial({
      color: '#d7e1de',
      transparent: true,
      opacity: 0.08,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    [4.99, 1.78, 0],
  );
  glass.rotation.y = -Math.PI / 2;
  glass.castShadow = false;
  const curtain = new THREE.Group();
  const curtainMaterial = surface('#d3c8be', 1);
  curtainMaterial.side = THREE.DoubleSide;
  for (let side = 0; side < 2; side++) {
    const cloth = new THREE.PlaneGeometry(3.8, 3.2, 48, 4);
    const positions = cloth.attributes.position;
    for (let i = 0; i < positions.count; i++)
      positions.setZ(i, Math.sin(positions.getX(i) * 22) * 0.07);
    cloth.computeVertexNormals();
    const panel = mesh(
      cloth,
      curtainMaterial,
      [4.7, 1.75, side ? 2 : -2],
      curtain,
    );
    panel.rotation.y = -Math.PI / 2;
    panel.userData.side = side;
  }
  root.add(curtain);
  interactive(curtain, 'curtains');
  box(0.05, 0.05, 8, brass, [4.7, 3.42, 0]);
  // Low, upholstered reading sofa with seams, piping and loose cushions.
  for (const z of [-0.73, 1.33])
    for (const x of [-4.14, -3.32])
      cylinder(0.035, 0.025, 0.2, walnut, [x, 0.1, z]);
  box(1.22, 0.24, 2.9, green, [-3.75, 0.33, 0.3], 0.1).userData.niaActivity =
    'read';
  box(0.2, 0.72, 2.85, green, [-4.3, 0.67, 0.3], 0.08);
  for (const z of [-1.02, 1.62])
    box(1.22, 0.5, 0.25, green, [-3.75, 0.61, z], 0.1);
  for (let i = 0; i < 3; i++) {
    box(
      0.92,
      0.16,
      0.78,
      green,
      [-3.64, 0.51, -0.49 + i * 0.79],
      0.08,
    ).userData.niaActivity = i === 2 ? 'rest' : 'read';
    const pillow = box(
      0.18,
      0.49,
      0.63,
      i === 1 ? violet : cream,
      [-4.07, 0.8, -0.44 + i * 0.77],
      0.09,
    );
    pillow.rotation.z = -0.15;
    pillow.rotation.x = i * 0.05 - 0.04;
  }
  const rugMaterial = surface('#b8a297', 1);
  const rug = box(3.4, 0.025, 3.9, rugMaterial, [-2.6, 0.018, 0.4], 0.01);
  rug.userData.walkSurface = true;
  for (let i = 0; i < 10; i++)
    box(0.013, 0.004, 3.65, cream, [-4.16 + i * 0.34, 0.033, 0.4], 0.001);
  for (const z of [-1.45, 2.25])
    for (let i = 0; i < 35; i++)
      box(0.009, 0.004, 0.16, cream, [-4.2 + i * 0.094, 0.03, z]);
  box(1.05, 0.08, 1.55, walnut, [-1.85, 0.43, 0.3], 0.04);
  for (const x of [-2.23, -1.47])
    for (const z of [-0.27, 0.87])
      cylinder(0.027, 0.019, 0.39, brass, [x, 0.195, z]);
  box(0.38, 0.038, 0.28, violet, [-1.83, 0.488, 0.65]);
  box(0.34, 0.025, 0.25, paper, [-1.81, 0.517, 0.62]);
  // Desk, chair, open notebook and monitor.
  box(2.3, 0.065, 0.9, walnut, [-2.8, 0.77, -3.2], 0.025);
  for (const x of [-3.8, -1.8])
    for (const z of [-3.55, -2.9])
      cylinder(0.028, 0.023, 0.74, black, [x, 0.37, z]);
  box(0.85, 0.09, 0.16, walnut, [-2.8, 0.11, -3.35]);
  box(0.79, 0.48, 0.035, black, [-2.82, 1.19, -3.42]).userData.niaActivity =
    'code';
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: '#1d2630',
    emissive: '#746381',
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
  box(
    0.74,
    0.42,
    0.008,
    screenMaterial,
    [-2.82, 1.19, -3.398],
  ).userData.niaActivity = 'code';
  const cursor = box(0.008, 0.026, 0.004, paper, [-2.61, 1.1, -3.39]);
  cursor.visible = false;
  let niaActivity: RoomActivity | null = null;
  let activityTime = 0;
  cylinder(0.022, 0.03, 0.22, brass, [-2.82, 0.9, -3.43]);
  box(0.3, 0.016, 0.2, black, [-2.82, 0.812, -3.36]);
  for (let i = 0; i < 5; i++)
    box(
      0.46 - i * 0.045,
      0.008,
      0.002,
      i === 0 ? violet : paper,
      [-2.86, 1.3 - i * 0.05, -3.392],
      0.001,
    );
  box(0.5, 0.018, 0.2, cream, [-2.7, 0.815, -2.95]);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 11; col++)
      box(
        0.03,
        0.005,
        0.026,
        paper,
        [-2.9 + col * 0.038, 0.827, -3.014 + row * 0.037],
        0.002,
      );
  box(0.28, 0.018, 0.33, paper, [-1.94, 0.815, -3.09]);
  const pen = cylinder(0.006, 0.006, 0.18, brass, [-1.93, 0.833, -3.06]);
  pen.rotation.x = Math.PI / 2;
  pen.rotation.z = -0.3;
  box(0.6, 0.12, 0.6, violet, [-2.8, 0.46, -2.3], 0.06).userData.niaActivity =
    'code';
  box(0.59, 0.5, 0.1, violet, [-2.8, 0.74, -2.04], 0.06).userData.niaActivity =
    'code';
  for (const x of [-3.03, -2.57])
    for (const z of [-2.5, -2.1])
      cylinder(0.018, 0.012, 0.4, walnut, [x, 0.2, z]);
  // Books, ceramic objects and records make the room specific to Nia.
  const shelf = new THREE.Group();
  for (const y of [0.16, 0.68, 1.2, 1.72, 2.24])
    box(2.3, 0.045, 0.45, walnut, [0.25, y, -3.7], 0.015, shelf);
  for (const x of [-0.9, 0.25, 1.4])
    box(0.04, 2.25, 0.45, walnut, [x, 1.13, -3.7], 0.01, shelf);
  const bookColors = [
    '#727b77',
    '#bba791',
    '#5d536d',
    '#9a624f',
    '#d2c6ad',
    '#35383c',
  ];
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 14; i++) {
      if ((i + row * 3) % 8 === 0) continue;
      const h = 0.23 + ((i * 13 + row * 7) % 10) * 0.017;
      const cover = surface(bookColors[(i + row) % bookColors.length], 0.92);
      box(
        0.085,
        h,
        0.24,
        cover,
        [-0.75 + i * 0.145, 0.19 + row * 0.52 + h / 2, -3.57],
        0.007,
        shelf,
      );
      box(
        0.06,
        0.012,
        0.003,
        paper,
        [-0.75 + i * 0.145, 0.24 + row * 0.52 + h / 2, -3.448],
        0.001,
        shelf,
      );
    }
  root.add(shelf);
  const ceramic = surface('#b98b70', 0.6);
  const vase = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.08, 0),
      new THREE.Vector2(0.13, 0.07),
      new THREE.Vector2(0.12, 0.2),
      new THREE.Vector2(0.055, 0.3),
      new THREE.Vector2(0.06, 0.32),
    ],
    32,
  );
  mesh(vase, ceramic, [0.55, 2.27, -3.62]);
  // The front kitchen island includes cabinet panels, a basin and a curved tap.
  box(2.7, 0.84, 1.05, cream, [2.85, 0.42, 2.7], 0.015);
  box(2.8, 0.055, 1.13, surface('#ded7cb', 0.45), [2.85, 0.87, 2.7], 0.02);
  for (let i = 0; i < 4; i++) {
    box(0.63, 0.68, 0.035, cream, [1.83 + i * 0.68, 0.44, 2.155]);
    box(0.22, 0.014, 0.02, brass, [1.83 + i * 0.68, 0.72, 2.128]);
  }
  box(0.63, 0.014, 0.48, black, [3.55, 0.906, 2.7], 0.09);
  box(
    0.52,
    0.01,
    0.38,
    surface('#797978', 0.25, 0.7),
    [3.55, 0.916, 2.7],
    0.08,
  );
  tube(
    [
      new THREE.Vector3(3.57, 0.9, 3.06),
      new THREE.Vector3(3.57, 1.21, 3.06),
      new THREE.Vector3(3.57, 1.27, 2.84),
      new THREE.Vector3(3.57, 1.13, 2.79),
    ],
    0.018,
    brass,
  );
  cylinder(0.15, 0.13, 0.05, walnut, [2.1, 0.926, 2.7]);
  for (let i = 0; i < 4; i++)
    mesh(
      new THREE.SphereGeometry(0.054, 16, 10),
      surface(i % 2 ? '#9baf68' : '#cda16a'),
      [2.03 + (i % 2) * 0.1, 0.982, 2.66 + Math.floor(i / 2) * 0.08],
    );
  function cup(x: number, y: number, z: number) {
    cylinder(0.048, 0.037, 0.085, cream, [x, y + 0.044, z]);
    cylinder(0.04, 0.04, 0.001, surface('#3f2a20'), [x, y + 0.087, z]);
    const handle = mesh(new THREE.TorusGeometry(0.031, 0.007, 8, 16), cream, [
      x + 0.052,
      y + 0.05,
      z,
    ]);
    handle.rotation.y = Math.PI / 2;
  }
  cup(-1.6, 0.474, -0.13);
  cup(-3.59, 0.805, -3.13);
  // A record player has a visible, user-controlled turntable; no ambient autoplay.
  const player = new THREE.Group();
  box(0.8, 0.55, 0.65, walnut, [-4.08, 0.275, 2.9], 0.025, player);
  box(0.69, 0.055, 0.51, black, [-4.08, 0.58, 2.9], 0.015, player);
  const vinyl = cylinder(
    0.19,
    0.19,
    0.01,
    surface('#18191c', 0.3),
    [-4.17, 0.618, 2.9],
    player,
  );
  const label = cylinder(
    0.052,
    0.052,
    0.012,
    violet,
    [-4.17, 0.623, 2.9],
    player,
  );
  for (const radius of [0.09, 0.12, 0.15, 0.175]) {
    const groove = mesh(
      new THREE.TorusGeometry(radius, 0.0015, 4, 64),
      surface('#414047', 0.35),
      [0, 0.007, 0],
      vinyl,
    );
    groove.rotation.x = Math.PI / 2;
  }
  tube(
    [
      new THREE.Vector3(-3.85, 0.66, 3.03),
      new THREE.Vector3(-3.93, 0.66, 2.93),
      new THREE.Vector3(-4.04, 0.65, 2.79),
    ],
    0.008,
    brass,
    player,
  );
  const spindle = box(
    0.008,
    0.001,
    0.06,
    paper,
    [-4.17, 0.632, 2.87],
    0.001,
    label,
  );
  spindle.position.set(0, 0.009, -0.025);
  root.add(player);
  interactive(player, 'record');
  // Floor lamp: shade, diffuser and actual local light source.
  const lamp = new THREE.Group();
  cylinder(0.2, 0.22, 0.035, black, [-4.35, 0.035, -1.65], lamp);
  cylinder(0.012, 0.012, 1.58, brass, [-4.35, 0.82, -1.65], lamp);
  const shadeMaterial = new THREE.MeshStandardMaterial({
    color: '#efdfc4',
    side: THREE.DoubleSide,
    roughness: 0.9,
    emissive: '#ffbc70',
    emissiveIntensity: 0.15,
  });
  cylinder(0.17, 0.32, 0.37, shadeMaterial, [-4.35, 1.63, -1.65], lamp);
  const lampLight = new THREE.PointLight('#ffcc94', 0, 5, 2);
  lampLight.position.set(-4.35, 1.42, -1.65);
  lamp.add(lampLight);
  root.add(lamp);
  interactive(lamp, 'lamp');
  const pendantMaterial = shadeMaterial.clone();
  for (const x of [2.1, 3.25]) {
    cylinder(0.008, 0.008, 0.8, black, [x, 3.2, 2.7]);
    cylinder(0.09, 0.24, 0.2, pendantMaterial, [x, 2.69, 2.7]);
  }
  const kitchenLight = new THREE.PointLight('#ffdab1', 0, 5, 2);
  kitchenLight.position.set(2.8, 2.4, 2.6);
  root.add(kitchenLight);
  function plant(x: number, z: number, height: number) {
    cylinder(0.24, 0.18, 0.4, ceramic, [x, 0.2, z]);
    cylinder(0.216, 0.216, 0.02, surface('#463a2d'), [x, 0.407, z]);
    const leafMaterial = surface('#3d684e', 0.76);
    leafMaterial.side = THREE.DoubleSide;
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.39996,
        y = 0.5 + (i / 13) * height,
        reach = 0.3 + (13 - i) * 0.022;
      const end = new THREE.Vector3(
        x + Math.cos(angle) * reach,
        y + 0.12,
        z + Math.sin(angle) * reach,
      );
      tube(
        [new THREE.Vector3(x, 0.4, z), new THREE.Vector3(x, y - 0.2, z), end],
        0.009,
        leafMaterial,
      );
      const leafShape = new THREE.Shape();
      leafShape.moveTo(0, 0);
      leafShape.bezierCurveTo(-0.2, 0.13, -0.14, 0.36, 0, 0.45);
      leafShape.bezierCurveTo(0.14, 0.36, 0.2, 0.13, 0, 0);
      const leaf = mesh(new THREE.ShapeGeometry(leafShape, 8), leafMaterial, [
        end.x,
        end.y,
        end.z,
      ]);
      leaf.rotation.set(-Math.PI / 3, angle, angle * 0.12);
      leaf.scale.setScalar(0.8 + (i % 3) * 0.17);
    }
  }
  plant(4.2, -3.15, 1.6);
  // Abstract framed prints, authored with geometry rather than external artwork.
  for (let i = 0; i < 2; i++) {
    const frame = new THREE.Group();
    frame.position.set(-3.4 + i * 1.05, 2.37, -3.94);
    box(0.8, 0.95, 0.045, walnut, [0, 0, 0], 0.008, frame);
    box(0.72, 0.87, 0.01, paper, [0, 0, 0.026], 0.002, frame);
    const disc = mesh(
      new THREE.CircleGeometry(0.22, 48),
      surface(i ? '#846983' : '#b37c59'),
      [0.04, 0.1, 0.034],
      frame,
    );
    disc.scale.y = i ? 1 : 0.85;
    box(0.41, 0.06, 0.004, green, [-0.04, -0.15, 0.04], 0.002, frame);
    root.add(frame);
  }
  // Distant architecture sits beyond the glazing, beneath a changing sky.
  const skyline = new THREE.Group();
  const cityMaterial = surface('#a1a3b1', 0.95),
    cityWindow = new THREE.MeshStandardMaterial({
      color: '#c6c3b2',
      emissive: '#ffcc88',
      emissiveIntensity: 0.05,
    });
  const windowPositions: [number, number, number][] = [];
  for (let i = 0; i < 15; i++) {
    const h = 2 + ((i * 7) % 9) * 0.8,
      x = 10 + (i % 3) * 3.8,
      z = -15 + i * 2.1;
    box(2.1, h, 1.65, cityMaterial, [x, h / 2 - 2, z], 0.02, skyline);
    for (let row = 0; row < Math.floor(h / 0.65); row++)
      for (let col = 0; col < 3; col++)
        windowPositions.push([
          x - 1.055,
          row * 0.65 - 1.65,
          z - 0.5 + col * 0.5,
        ]);
  }
  const cityLights = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.01, 0.32, 0.27),
    cityWindow,
    windowPositions.length,
  );
  const windowTransform = new THREE.Matrix4();
  windowPositions.forEach((position, i) =>
    cityLights.setMatrixAt(i, windowTransform.makeTranslation(...position)),
  );
  cityLights.instanceMatrix.needsUpdate = true;
  skyline.add(cityLights);
  root.add(skyline);
  const sun = new THREE.DirectionalLight('#ffd5a5', 2.8);
  sun.position.set(8, 5, -2);
  sun.target.position.set(-2, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -7,
    right: 7,
    top: 7,
    bottom: -7,
    near: 0.5,
    far: 28,
  });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.018;
  root.add(sun, sun.target);
  const ambient = new THREE.HemisphereLight('#e6ddf1', '#625445', 0.55);
  root.add(ambient);
  const fill = new THREE.DirectionalLight('#ece6ff', 0.65);
  fill.position.set(0, 3, 6);
  root.add(fill);
  let current: RoomSettings = {
    light: 'sunset',
    lamp: true,
    curtains: false,
    music: false,
  };
  let curtainAmount = 0.15;
  return {
    root,
    floor,
    pickables,
    setActivity(activity: RoomActivity | null) {
      niaActivity = activity;
    },
    setSettings(settings: RoomSettings) {
      current = settings;
      const p = PALETTES[settings.light];
      scene.background = new THREE.Color(p.sky);
      scene.fog = new THREE.Fog(p.haze, 16, 42);
      sun.color.set(p.sun);
      sun.intensity = p.power;
      sun.position.set(
        8,
        settings.light === 'day' ? 9 : 4,
        settings.light === 'day' ? -1 : -5,
      );
      ambient.intensity = p.ambient;
      scene.environmentIntensity = settings.light === 'night' ? 0.3 : 0.6;
      renderer.toneMappingExposure = p.exposure;
      lampLight.intensity = settings.lamp ? 7 : 0;
      shadeMaterial.emissiveIntensity = settings.lamp ? 0.7 : 0.02;
      kitchenLight.intensity = settings.light === 'night' ? 12 : 2;
      pendantMaterial.emissiveIntensity =
        settings.light === 'night' ? 0.6 : 0.08;
      cityWindow.emissiveIntensity = settings.light === 'night' ? 1.7 : 0.02;
    },
    update(dt: number, camera: THREE.Camera, reduced: boolean) {
      if (!reduced) activityTime += dt;
      cursor.visible =
        niaActivity === 'code' &&
        (reduced || Math.sin(activityTime * 5) > -0.2);
      screenMaterial.emissiveIntensity = niaActivity === 'code' ? 0.7 : 0.35;
      const desired = current.curtains ? 1 : 0.16;
      curtainAmount = reduced
        ? desired
        : THREE.MathUtils.damp(curtainAmount, desired, 4, dt);
      for (const panel of curtain.children) {
        const sign = panel.userData.side ? 1 : -1;
        panel.scale.x = curtainAmount;
        panel.position.z = sign * (3.87 - 1.87 * curtainAmount);
      }
      if (current.music && !reduced) {
        vinyl.rotation.y -= dt * 3.5;
        label.rotation.y -= dt * 3.5;
      }
      backMaterial.opacity = THREE.MathUtils.damp(
        backMaterial.opacity,
        camera.position.z < -3.7 ? 0.12 : 1,
        6,
        dt,
      );
      leftMaterial.opacity = THREE.MathUtils.damp(
        leftMaterial.opacity,
        camera.position.x < -4.7 ? 0.12 : 1,
        6,
        dt,
      );
    },
    dispose() {
      sun.shadow.dispose();
      disposeModel(root);
      plaster.dispose();
      cityLights.dispose();
      // Maps shared between cloned wall materials are already disposed by disposeModel.
      scene.remove(root);
    },
  };
}
