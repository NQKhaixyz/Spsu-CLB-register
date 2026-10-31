import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createCat } from "./cats";
import { daylightAt } from "../../lib/garden-time";

export type GardenWorld = { update: (hour: number, paused: boolean) => void; dispose: () => void };

export function createGarden(host: HTMLElement, initial: { hour: number; paused: boolean }, onLost: () => void): GardenWorld {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 160);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setClearColor("#dce7dc", 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  host.appendChild(renderer.domElement);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, roughness = 0.84) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness }));
    return materials.get(color)!;
  };
  const grass = mat("#a5b29a"), stone = mat("#d6cebc"), timber = mat("#8e6250"), wood = mat("#b78a68"), roof = mat("#516366"), paper = mat("#f5e6cb"), red = mat("#ad6556");
  const garden = new THREE.Group(); scene.add(garden);
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = garden) {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, radius = 0.035, parent: THREE.Object3D = garden) {
    return mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, h / 3, w / 3, d / 3)), material, x, y, z, parent);
  }
  function orb(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent: THREE.Object3D = garden) {
    const m = mesh(sphere, material, x, y, z, parent); m.scale.set(sx, sy, sz); return m;
  }
  function branch(a: number[], b: number[], radius: number, material: THREE.Material, parent: THREE.Object3D = garden) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const m = mesh(new THREE.CylinderGeometry(radius * 0.7, radius, delta.length(), 8), material, 0, 0, 0, parent);
    m.position.copy(from.add(to).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  // A continuous world fills the viewport, with no miniature base or enclosing frame.
  const skyMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { topColor: { value: new THREE.Color("#b3cbd1") }, bottomColor: { value: new THREE.Color("#f1dfba") } },
    vertexShader: "varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorld; void main(){float h=normalize(vWorld).y;gl_FragColor=vec4(mix(bottomColor,topColor,smoothstep(-0.08,0.65,h)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16), skyMaterial); scene.add(sky);
  scene.fog = new THREE.Fog("#d8dfd0", 22, 65);
  const ground = mesh(new THREE.PlaneGeometry(180, 180), grass, 0, 0.085, -15); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  const path = mesh(new THREE.PlaneGeometry(100, 3.3), mat("#d8cbb6"), 0, 0.112, 4.8); path.rotation.x = -Math.PI / 2; path.castShadow = false;
  const approach = mesh(new THREE.PlaneGeometry(1.8, 12), mat("#d8cbb6"), -2.5, 0.118, -0.6); approach.rotation.x = -Math.PI / 2; approach.castShadow = false;
  for (let i = 0; i < 30; i++) {
    const rock = mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.055, 7), stone, -12 + i * 0.83, 0.17, 4.6 + Math.sin(i * 1.4) * 0.17);
    rock.rotation.y = i;
  }
  // Engawa, shoji screens and tiled gabled roof.
  const house = new THREE.Group(); house.position.set(-3.5, 0.1, -3.5); house.scale.setScalar(1.85); garden.add(house);
  box(2.8, 0.22, 1.75, timber, 0, 0.22, 0.05, 0.045, house);
  for (let i = 0; i < 16; i++) box(0.15, 0.06, 1.77, wood, -1.23 + i * 0.165, 0.35, 0.05, 0.01, house);
  box(1.1, 0.12, 0.42, timber, 0.4, 0.18, 1.03, 0.025, house);
  box(1.25, 0.12, 0.43, wood, 0.4, 0.08, 1.29, 0.025, house);
  box(2.25, 1.3, 1.08, paper, 0, 1, -0.15, 0.04, house);
  const windowMaterial = new THREE.MeshStandardMaterial({ color: "#fae6bd", emissive: "#ffc476", emissiveIntensity: 0 });
  for (const x of [-0.74, 0, 0.74]) {
    box(0.66, 1.12, 0.04, windowMaterial, x, 1.01, 0.416, 0.006, house);
    for (const dx of [-0.33, 0, 0.33]) box(0.024, 1.17, 0.04, timber, x + dx, 1.01, 0.449, 0.005, house);
    for (let i = 0; i < 5; i++) box(0.67, 0.022, 0.04, timber, x, 0.51 + i * 0.25, 0.45, 0.005, house);
  }
  for (const x of [-1.16, 1.16]) for (const z of [-0.72, 0.64]) box(0.095, 1.44, 0.095, timber, x, 1.02, z, 0.018, house);
  for (const x of [-1.135, 1.135]) {
    box(0.035, 1.12, 0.88, paper, x, 1.02, -0.15, 0.01, house);
    for (let i = 0; i < 5; i++) box(0.045, 0.025, 0.9, timber, x, 0.55 + i * 0.23, -0.15, 0.005, house);
  }
  // Two roof planes, rows of tiles, lifted eaves, and a ridge cap.
  for (const direction of [-1, 1]) {
    const half = new THREE.Group(); half.position.set(0, 2.02, -0.15); half.rotation.x = direction * 0.38; house.add(half);
    box(2.95, 0.1, 1.18, roof, 0, 0, direction * 0.53, 0.04, half);
    for (let i = 0; i < 19; i++) box(0.035, 0.045, 1.17, mat("#637779"), -1.4 + i * 0.155, 0.07, direction * 0.53, 0.015, half);
    box(3.05, 0.12, 0.12, roof, 0, 0.025, direction * 1.1, 0.04, half);
  }
  box(3.1, 0.14, 0.17, roof, 0, 2.12, -0.15, 0.05, house);
  // Terrace objects: cushion, tea tray, pot and two cups.
  box(0.43, 0.1, 0.37, red, -0.7, 0.43, 0.65, 0.08, house);
  box(0.35, 0.065, 0.29, timber, 0, 0.41, 0.65, 0.025, house);
  orb(0, 0.51, 0.65, 0.09, 0.08, 0.08, mat("#658b7c"), house);
  for (const x of [-0.12, 0.12]) mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.045, 12), paper, x, 0.47, 0.72, house);
  // Pond, lily pads and koi; scalloped stone edge.
  const pond = new THREE.Group(); pond.position.set(3.7, 0.13, 0.7); pond.scale.setScalar(2.1); garden.add(pond);
  const pondBase = mesh(new THREE.CylinderGeometry(0.96, 1.06, 0.1, 48), mat("#8a9e96"), 0, 0, 0, pond); pondBase.scale.z = 0.74;
  const waterMat = new THREE.MeshStandardMaterial({ color: "#6fa9a6", roughness: 0.24, metalness: 0.25, transparent: true, opacity: 0.9 });
  const water = mesh(new THREE.CircleGeometry(0.95, 48), waterMat, 0, 0.057, 0, pond); water.rotation.x = -Math.PI / 2; water.scale.y = 0.74; water.receiveShadow = true;
  for (let i = 0; i < 18; i++) { const t = i / 18 * Math.PI * 2; const r = orb(Math.cos(t), 0.045, Math.sin(t) * 0.75, 0.15, 0.1, 0.12, i % 2 ? stone : mat("#bdc3ad"), pond); r.rotation.y = t; }
  const fish: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const koi = new THREE.Group(); pond.add(koi); fish.push(koi);
    orb(0, 0, 0, 0.055, 0.02, 0.15, mat(i % 2 ? "#f3e8ce" : "#d8865b"), koi);
    orb(0, 0.015, -0.03, 0.045, 0.008, 0.04, mat("#ba6d4c"), koi);
    const fin = mesh(new THREE.ConeGeometry(0.06, 0.11, 3), mat("#f0d9ad"), 0, 0, -0.17, koi); fin.rotation.x = Math.PI / 2; fin.scale.z = 0.3;
  }
  for (const [x, z] of [[0.5, -0.25], [0.6, 0], [-0.45, 0.3]]) { const pad = mesh(new THREE.CircleGeometry(0.14, 24, 0.2, Math.PI * 1.85), mat("#668c64"), x, 0.07, z, pond); pad.rotation.x = -Math.PI / 2; }
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) { const ring = mesh(new THREE.RingGeometry(0.15, 0.159, 48), new THREE.MeshBasicMaterial({ color: "#d3ebe0", transparent: true, opacity: 0.25, side: THREE.DoubleSide }), 0.1, 0.075, 0.1, pond); ring.rotation.x = -Math.PI / 2; ripples.push(ring); }
  // Torii gate and low bamboo fence behind the water.
  const gate = new THREE.Group(); gate.position.set(5, 0.12, -4.6); gate.scale.setScalar(1.8); garden.add(gate);
  for (const x of [-0.55, 0.55]) { branch([x, 0, 0], [x * 0.94, 1.8, 0], 0.075, red, gate); box(0.21, 0.14, 0.23, roof, x, 0.07, 0, 0.035, gate); }
  box(1.5, 0.12, 0.17, red, 0, 1.43, 0, 0.025, gate); box(1.65, 0.12, 0.23, red, 0, 1.77, 0, 0.035, gate);
  box(1.82, 0.1, 0.26, roof, 0, 1.87, 0, 0.035, gate); box(0.18, 0.3, 0.08, timber, 0, 1.59, 0.12, 0.01, gate);
  for (let i = 0; i < 40; i++) box(0.075, 1.1, 0.075, wood, -12 + i * 0.62, 0.65, -7.2, 0.015);
  for (const y of [0.4, 1]) box(25, 0.075, 0.1, timber, 0, y, -7.2, 0.01);
  // Sakura with clustered, softly shaded blossoms.
  const blossoms = [mat("#e7b5bc"), mat("#f3ced0"), mat("#d99caa"), mat("#f4dbd5")];
  function tree(x: number, z: number, scale: number) {
    const tree = new THREE.Group(); tree.position.set(x, 0.13, z); tree.scale.setScalar(scale); garden.add(tree);
    branch([0, 0, 0], [0.1, 1.9, 0], 0.13, timber, tree);
    branch([0.08, 0.85, 0], [-0.7, 2.2, 0.12], 0.08, timber, tree);
    branch([0.1, 1.25, 0], [0.8, 2.38, -0.1], 0.07, timber, tree);
    branch([0.1, 1.35, 0], [0.1, 2.3, 0.6], 0.06, timber, tree);
    for (let i = 0; i < 23; i++) {
      const angle = i * 2.399;
      const radius = Math.sqrt(i / 23) * 1.05;
      const m = mesh(new THREE.IcosahedronGeometry(0.49 + (i % 3) * 0.055, 1), blossoms[i % 4], Math.cos(angle) * radius, 2.35 + Math.sin(i * 3.2) * 0.24 - radius * 0.15, Math.sin(angle) * radius * 0.72, tree);
      m.scale.y = 0.72; m.rotation.set(i * 0.13, i * 0.7, i);
    }
  }
  tree(-7.4, -0.8, 2.05); tree(1.3, -7.2, 1.5); tree(8.4, -1.8, 1.85); tree(-11, -9, 2.2);
  // Distant mountains, cedars and a luminous sun/moon are actual scene geometry.
  const mountainMaterials = [mat("#a6b6ae"), mat("#8caaa3"), mat("#bfd0c3")];
  for (let i = 0; i < 9; i++) {
    const mountain = mesh(new THREE.ConeGeometry(7 + i % 3 * 2, 10 + i % 4 * 2, 5), mountainMaterials[i % 3], -38 + i * 10, 3, -30 - i % 3 * 6);
    mountain.rotation.y = i * 0.48; mountain.castShadow = false;
  }
  for (let i = 0; i < 13; i++) {
    const x = -16 + i * 2.6, z = -12 - i % 4 * 1.2;
    branch([x, 0, z], [x, 4.4, z], 0.13, timber);
    for (let level = 0; level < 3; level++) mesh(new THREE.ConeGeometry(1.2 - level * 0.23, 2.4, 8), mat(i % 2 ? "#6b8b78" : "#7e9880"), x, 2.1 + level * 1.1, z);
  }
  const celestialMaterial = new THREE.MeshBasicMaterial({ color: "#fff0be", fog: false });
  const celestial = mesh(new THREE.SphereGeometry(2, 32, 24), celestialMaterial, 13, 8, -30, scene); celestial.castShadow = false;
  const starPositions = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) {
    starPositions[i * 3] = -35 + (i * 0.618 % 1) * 70;
    starPositions[i * 3 + 1] = 6 + (i * 0.731 % 1) * 14;
    starPositions[i * 3 + 2] = -25 - (i * 0.473 % 1) * 20;
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: "#fff8d9", size: 0.075, transparent: true, opacity: 0, depthWrite: false, fog: false });
  scene.add(new THREE.Points(starGeometry, starMaterial));
  // Rounded clipped shrubs and ornamental stones.
  for (const [x, z, size] of [[-7, 1, 0.8], [-6, -6, 0.65], [6, 0.9, 0.8], [7, 3.1, 0.5], [-6, 3, 0.6], [1, -3.2, 0.8], [-9, 6, 0.7], [10, 7, 1.1], [-11, -4, 1.4]]) {
    orb(x, 0.15 + size * 0.4, z, size, size * 0.65, size, mat("#6f8b65"));
    orb(x + size * 0.6, 0.18, z + 0.18, size * 0.45, size * 0.35, size * 0.5, mat("#a5ad99"));
  }
  const lanternMaterial = new THREE.MeshStandardMaterial({ color: "#f5dba6", emissive: "#ffc06c", emissiveIntensity: 0.15 });
  const lanternLights: THREE.PointLight[] = [];
  for (const [x, z] of [[-5.8, 2.6], [5.8, 2.8], [-9, 3], [9, 3]]) {
    box(0.36, 0.13, 0.36, stone, x, 0.2, z, 0.04); box(0.13, 0.52, 0.13, stone, x, 0.5, z, 0.02);
    box(0.3, 0.31, 0.3, lanternMaterial, x, 0.86, z, 0.02);
    for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) box(0.035, 0.34, 0.035, timber, x + dx, 0.86, z + dz, 0.008);
    const cap = mesh(new THREE.ConeGeometry(0.34, 0.2, 4), roof, x, 1.12, z); cap.rotation.y = Math.PI / 4;
    orb(x, 1.25, z, 0.055, 0.09, 0.055, roof);
    const light = new THREE.PointLight("#ffbf6a", 0, 3, 2); light.position.set(x, 0.94, z); garden.add(light); lanternLights.push(light);
  }
  // The two cats share the front path, on separate lanes.
  const cats = [createCat("british"), createCat("siamese")];
  cats.forEach(cat => { cat.root.scale.setScalar(1.03); garden.add(cat.root); });
  // Deterministic petal positions avoid random hydration or flickering on remount.
  const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), blossoms[1], 32);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage); garden.add(petals);
  const dummy = new THREE.Object3D();
  const ambient = new THREE.HemisphereLight("#ffeedb", "#9ba795", 2.1); scene.add(ambient);
  const sun = new THREE.DirectionalLight("#ffe4c4", 3.2); sun.position.set(-3, 8, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536); sun.shadow.camera.left = -12; sun.shadow.camera.right = 12; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12; sun.shadow.normalBias = 0.04; sun.shadow.bias = -0.0005; scene.add(sun);
  const fill = new THREE.DirectionalLight("#c6e1e9", 0.6); fill.position.set(4, 3, -2); scene.add(fill);
  let hour = initial.hour, paused = initial.paused, visible = true, disposed = false, time = 0, last = 0;
  let pointerX = 0, pointerY = 0;
  function lightForTime() {
    const daylight = daylightAt(hour);
    const twilight = daylight > 0 && daylight < 1;
    skyMaterial.uniforms.topColor.value.set(daylight === 0 ? "#172a46" : twilight ? "#aa91a6" : "#b6d2d6");
    skyMaterial.uniforms.bottomColor.value.set(daylight === 0 ? "#5c748b" : twilight ? "#edbd91" : "#f0e6ce");
    scene.fog!.color.set(daylight === 0 ? "#465d70" : twilight ? "#ceb5a7" : "#d2ddd1");
    celestialMaterial.color.set(daylight === 0 ? "#e2e8e5" : "#ffedb5");
    celestial.position.y = twilight ? 4 : 8;
    starMaterial.opacity = (1 - daylight) * 0.8;
    ambient.intensity = 0.65 + daylight * 1.5;
    sun.intensity = 0.55 + daylight * 2.65;
    sun.color.set(daylight < 0.05 ? "#b3c8ed" : daylight < 0.9 ? "#ffb078" : "#ffe4c4");
    sun.position.x = -4 + Math.max(0, Math.min(1, (hour - 6) / 12)) * 8;
    sun.position.y = 8 + daylight * 7;
    ambient.color.set(daylight < 0.1 ? "#b1c6e6" : "#ffeedb");
    lanternMaterial.emissiveIntensity = 0.2 + (1 - daylight) * 2.7;
    windowMaterial.emissiveIntensity = (1 - daylight) * 1.2;
    lanternLights.forEach(light => { light.intensity = (1 - daylight) * 2.4; });
    renderer.toneMappingExposure = 0.95 + daylight * 0.25;
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 52 : 43;
    camera.updateProjectionMatrix(); draw(0);
  }
  function draw(dt: number) {
    time += dt;
    camera.position.set(0.4 + pointerX * 0.7, 6.1 + pointerY * 0.4, camera.aspect < 0.8 ? 19 : 16);
    camera.lookAt(0, 1.25, -1.5);
    cats.forEach((cat, i) => {
      const cycle = (time * 0.115 + (i ? 2.8 : -0.65)) % (Math.PI * 2);
      const walking = Math.abs(Math.cos(cycle)) > 0.16;
      cat.root.position.set(Math.sin(cycle) * (camera.aspect < 0.8 ? 2.5 : 6.8), 0.19, (i ? 4.4 : 5.5) + Math.sin(cycle * 2) * 0.35);
      // Smooth turn at either end, rather than popping between directions.
      const yaw = Math.atan2(Math.cos(cycle) * 3, 0.5);
      cat.root.rotation.y = yaw;
      cat.animate(time + i * 1.6, walking);
    });
    fish.forEach((koi, i) => { const a = time * 0.35 + i * 2.1; koi.position.set(Math.cos(a) * 0.5, 0.063, Math.sin(a) * 0.38); koi.rotation.y = -a; });
    ripples.forEach((ring, i) => { const p = (time * 0.2 + i / 3) % 1; ring.scale.setScalar(0.4 + p * 3.6); (ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.3; });
    for (let i = 0; i < 32; i++) {
      const p = (time * 0.12 + i * 0.618) % 1;
      dummy.position.set(-9 + (i * 0.413 % 1) * 18 + p, 0.15 + (1 - p) * 7, -4 + (i * 0.731 % 1) * 11);
      dummy.rotation.set(time * 0.6 + i, i, time * 0.5 + i); dummy.scale.set(0.032, 0.009, 0.05); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }
  function animate(now: number) {
    if (!visible || document.hidden || paused) { last = now; return; }
    if (now - last < 1000 / 30) return;
    const dt = last ? Math.min((now - last) / 1000, 0.06) : 0;
    last = now; draw(dt);
  }
  const pointer = (e: PointerEvent) => {
    if (paused || e.pointerType === "touch") return;
    const r = host.getBoundingClientRect(); pointerX = (e.clientX - r.left) / r.width - 0.5; pointerY = (e.clientY - r.top) / r.height - 0.5;
  };
  const leave = () => { pointerX = 0; pointerY = 0; };
  const lost = (e: Event) => { e.preventDefault(); renderer.setAnimationLoop(null); onLost(); };
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; last = 0; }, { rootMargin: "60px" }); intersection.observe(host);
  window.addEventListener("pointermove", pointer, { passive: true }); document.addEventListener("pointerleave", leave);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  lightForTime(); resize(); renderer.setAnimationLoop(animate);
  return {
    update(nextHour, nextPaused) { if (disposed) return; hour = nextHour; paused = nextPaused; lightForTime(); draw(0); },
    dispose() {
      disposed = true; renderer.setAnimationLoop(null); resizeObserver.disconnect(); intersection.disconnect();
      window.removeEventListener("pointermove", pointer); document.removeEventListener("pointerleave", leave); renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => mats.add(m)); } });
      geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
