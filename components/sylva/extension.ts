import * as THREE from "three";
import { createCat } from "../garden/cats";

declare global { interface Window { nhipSylva?: { ready: boolean }; } }
const runtime = (window as unknown as { THREE: typeof THREE }).THREE;
const OriginalRenderer = runtime.WebGLRenderer;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
window.nhipSylva = { ready: false };

// The authored r149 defines render per instance; a prototype patch misses it.
// This hook runs before the untouched authored document creates its renderer.
class ClubRenderer extends OriginalRenderer {
  constructor(parameters?: THREE.WebGLRendererParameters) {
    super(parameters);
    const render = this.render.bind(this);
    let world: THREE.Scene | undefined;
    let root: THREE.Group | undefined;
    let cats: ReturnType<typeof createCat>[] = [];
    let surface: (x: number) => number = () => 0;
    let lastTime = performance.now();
    let elapsed = 0;

    const mount = (scene: THREE.Scene) => {
      const groups = scene.children.filter(o => o.userData.blades).sort((a, b) => b.userData.blades - a.userData.blades);
      if (!groups[0]) return;
      root = groups[0] as THREE.Group;
      const bark = root.children.find(o => (o as THREE.Mesh).geometry?.getAttribute("inf")) as THREE.Mesh;
      if (!bark) return;
      const probe = new THREE.Mesh(bark.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      probe.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      const heights: number[] = [];
      for (let i = 0; i <= 160; i++) {
        ray.set(new THREE.Vector3(-4 + i * 5.2 / 160, 5, .30), new THREE.Vector3(0, -1, 0));
        heights.push(ray.intersectObject(probe)[0]?.point.y ?? -.9);
      }
      (probe.material as THREE.Material).dispose();
      surface = x => {
        const f = Math.min(159.999, Math.max(0, (x + 4) / 5.2 * 160));
        const i = Math.floor(f);
        return THREE.MathUtils.lerp(heights[i], heights[i + 1], f - i);
      };
      cats = [createCat("british"), createCat("siamese")];
      cats.forEach(cat => root!.add(cat.root));
      const hemisphere = new THREE.HemisphereLight(0xeef2de, 0x424933, .65);
      const sunlight = new THREE.DirectionalLight(0xfff2d4, .9);
      sunlight.position.set(-500, 900, 900);
      scene.add(hemisphere, sunlight);
      world = scene;
      window.nhipSylva!.ready = true;
      document.documentElement.dataset.nhipCats = "ready";
    };

    this.render = (scene, camera) => {
      if (!world && scene instanceof THREE.Scene) mount(scene);
      if (root && scene === world) {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, .05);
        lastTime = now;
        if (!document.hidden && !reducedMotion.matches) elapsed += dt;
        cats.forEach((cat, i) => {
          const phase = elapsed * .12 + i * Math.PI + .65;
          const x = (i ? -.65 : -2.8) + Math.sin(phase) * .65;
          const speed = Math.cos(phase);
          cat.root.position.set(x, surface(x) + .025, .30);
          cat.root.scale.setScalar(window.innerWidth <= 900 ? .52 : .45);
          cat.root.rotation.y = Math.atan2(speed * 2.6, .8);
          cat.animate(elapsed * .8 + i * 2.1, Math.abs(speed) > .12 && !reducedMotion.matches);
        });
      }
      render(scene, camera);
    };
  }
}
runtime.WebGLRenderer = ClubRenderer;
