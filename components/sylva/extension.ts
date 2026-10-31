// Runs inside the authored local document with its own verified Three.js runtime.
// It adds the requested cats through render(), leaving Sylva's source/shaders intact.
import * as THREE from "three";
import { createCat } from "../garden/cats";

type Settings = { hour: number; paused: boolean; presentation: "hero" | "background" };
declare global {
  interface Window {
    nhipSylva?: { set: (value: Settings) => void; ready: boolean };
  }
}

let settings: Settings = { hour: 12, paused: false, presentation: "hero" };
let cats: ReturnType<typeof createCat>[] = [];
let root: THREE.Group | undefined;
let ready = false;
let lastTime = performance.now();
let elapsed = 0;
let mainScene: THREE.Scene | undefined;
let surface: (x: number) => number = () => -0.8;
let hemisphere: THREE.HemisphereLight;
let sunlight: THREE.DirectionalLight;
let lastHour = -1;
const originalRender = THREE.WebGLRenderer.prototype.render;
const originalDelta = THREE.Clock.prototype.getDelta;
const originalExposure = 1.30;

function emit(action: "login" | "motion" | "focus") {
  window.parent.postMessage({ type: "nhip-sylva-action", action }, window.location.origin);
}

function localize() {
  document.documentElement.lang = "vi";
  const text = (selector: string, value: string) => {
    const el = document.querySelector(selector); if (el) el.textContent = value;
  };
  text(".headline span:nth-child(1) i", "Cùng một nhịp,");
  text(".headline span:nth-child(2) i", "cùng lớn lên.");
  text(".lede", "Một nơi để gặp gỡ, góp sức và gắn kết. Hẹn nhau qua từng buổi họp, từng ca trực C1.");
  text(".ghost", "NHỊP CLB");
  text(".card--about .label", "MỖI TUẦN MỘT HẸN");
  text(".card--about h2", "Gặp nhau, cùng sẻ chia.");
  text(".card--stove .label", "CÙNG NHAU GÓP SỨC");
  text(".card--stove h2", "Một ca trực, một niềm vui.");
  text(".stat--a dt", "Đăng ký họp"); text(".stat--a dd", "Thứ Hai – Chủ nhật");
  text(".stat--b dt", "Lịch trực C1"); text(".stat--b dd", "Sáng & chiều");
  text(".liquid-button--explore .lbl", "Vào không gian CLB");
  const labels = ["Nhịp CLB", "Khu vườn", "Lịch trực", "Họp tuần", "Đăng nhập"];
  document.querySelectorAll<HTMLElement>("[data-dock]").forEach((el, i) => {
    el.setAttribute("aria-label", labels[i]); el.setAttribute("title", labels[i]);
    const label = el.querySelector("span:not(.glyph)"); if (label) label.textContent = labels[i];
    if (i > 1) el.addEventListener("click", () => emit("login"));
    else el.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  });
  for (const selector of [".liquid-button--explore", ".knob--about", ".card--stove .knob"]) {
    const el = document.querySelector(selector); el?.setAttribute("aria-label", "Mở đăng nhập CLB");
    el?.addEventListener("click", () => emit("login"));
  }
  document.querySelector(".liquid-button--play")?.addEventListener("click", () => emit("motion"));
  const scroll = document.querySelector(".scroll");
  if (scroll?.firstChild) scroll.firstChild.textContent = "Khám phá";
  scroll?.addEventListener("click", (event) => { event.preventDefault(); emit("focus"); });
  const style = document.createElement("style");
  style.textContent = `
    /* Only CLB copy/readability and app presentation; the authored scene stays intact. */
    .ghost { font-size:calc(240 * var(--u)); letter-spacing:calc(14 * var(--u)); }
    .card--about h2 { width:calc(255 * var(--u)); }
    .card--stove h2 { width:calc(250 * var(--u)); }
    .card .label { font-size:calc(11 * var(--u)); font-weight:500; letter-spacing:.06em; }
    .lede { width:calc(248 * var(--u)); }
    .stat--a { left:calc(1240 * var(--u)); }
    .stat--b { left:calc(1305 * var(--u)); }
    html[data-nhip-presentation="background"] .dock-wrap,
    html[data-nhip-presentation="background"] .stage > :not(.guides):not(.ghost) { visibility:hidden; pointer-events:none; }
    html[data-nhip-presentation="background"] body,
    html[data-nhip-presentation="background"] .hero { height:100vh; min-height:100vh; overflow:hidden; }
    @media(max-width:900px) {
      .lede { width:calc(620 * var(--u)); font-size:max(16px,calc(19 * var(--u))); line-height:1.55; }
      .card .label { font-size:max(11px,calc(13 * var(--u))); }
      .stat dt,.stat dd { font-size:max(12px,calc(16 * var(--u))); line-height:1.55; }
      .stat--a {left:calc(34 * var(--u));}.stat--b {left:calc(410 * var(--u));}
      .card--about h2,.card--stove h2 { width:calc(350 * var(--u)); }
      html[data-nhip-presentation="background"] .stage { position:absolute; top:50%; margin-top:calc(-680 * var(--u)); }
    }
  `;
  document.head.appendChild(style);
  const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "/fonts/lexend-vietnamese.css"; document.head.appendChild(link);
}

function mount(scene: THREE.Scene) {
  const groups = scene.children.filter((o) => o.userData.blades).sort((a, b) => b.userData.blades - a.userData.blades);
  if (!groups[0]) return;
  root = groups[0] as THREE.Group;
  const bark = root.children.find((o) => (o as THREE.Mesh).geometry?.getAttribute("inf")) as THREE.Mesh;
  if (!bark) return;
  // Sample the actual authored moss surface. Cats stand and walk on the root,
  // using the same coordinates and depth buffer as the flowers and butterfly.
  const probe = new THREE.Mesh(bark.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const heights: number[] = [];
  for (let i = 0; i <= 160; i++) {
    ray.set(new THREE.Vector3(-4 + i * 5.2 / 160, 5, 0.30), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(probe)[0]; heights.push(hit?.point.y ?? -0.9);
  }
  (probe.material as THREE.Material).dispose();
  surface = (x) => {
    const f = Math.min(159.999, Math.max(0, (x + 4) / 5.2 * 160));
    const i = Math.floor(f); return THREE.MathUtils.lerp(heights[i], heights[i + 1], f - i);
  };
  cats = [createCat("british"), createCat("siamese")];
  cats.forEach(cat => root!.add(cat.root));
  hemisphere = new THREE.HemisphereLight(0xeef2de, 0x424933, 1.25);
  sunlight = new THREE.DirectionalLight(0xfff2d4, 1.8); sunlight.position.set(-500, 900, 900);
  scene.add(hemisphere, sunlight);
  mainScene = scene; ready = true;
  document.documentElement.dataset.nhipCats = "ready";
  if (window.nhipSylva) window.nhipSylva.ready = true;
}

function updateDaylight(renderer: THREE.WebGLRenderer) {
  if (!mainScene || Math.abs(lastHour - settings.hour) < .001) return;
  lastHour = settings.hour;
  const day = THREE.MathUtils.smoothstep(Math.sin((settings.hour - 6) / 24 * Math.PI * 2), -.22, .5);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(.78, originalExposure, day);
  hemisphere.intensity = THREE.MathUtils.lerp(.75, 1.25, day);
  sunlight.intensity = THREE.MathUtils.lerp(.85, 1.8, day);
  sunlight.color.set(day < .25 ? 0xc6d5ec : 0xfff2d4);
  const tint = day < .25 ? "#252e2b" : "#4a4d44";
  (document.querySelector(".hero") as HTMLElement).style.backgroundColor = tint;
}

THREE.Clock.prototype.getDelta = function () {
  const dt = originalDelta.call(this);
  return settings.paused || document.hidden ? 0 : dt;
};
THREE.WebGLRenderer.prototype.render = function (scene, camera) {
  if (!ready && scene instanceof THREE.Scene) mount(scene);
  if (ready && root && scene === mainScene) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now;
    if (!settings.paused && !document.hidden) elapsed += dt;
    const scale = window.innerWidth <= 900 ? .52 : .39;
    cats.forEach((cat, i) => {
      const phase = elapsed * .12 + i * Math.PI + .65;
      const x = (i ? -.65 : -2.45) + Math.sin(phase) * (i ? 1.12 : .95);
      const speed = Math.cos(phase);
      cat.root.position.set(x, surface(x) + .025, .30);
      cat.root.scale.setScalar(scale);
      cat.root.rotation.y = Math.atan2(speed * 2.6, .8);
      cat.animate(elapsed * .8 + i * 2.1, Math.abs(speed) > .12 && !settings.paused);
    });
    updateDaylight(this);
  }
  originalRender.call(this, scene, camera);
};

window.nhipSylva = {
  ready: false,
  set(value) {
    const changed = settings.presentation !== value.presentation;
    settings = value;
    document.documentElement.dataset.nhipPresentation = value.presentation;
    const play = document.querySelector(".liquid-button--play");
    play?.setAttribute("aria-label", value.paused ? "Bật chuyển động" : "Tạm dừng chuyển động");
    play?.setAttribute("aria-pressed", String(value.paused));
    if (changed) { window.scrollTo(0, 0); window.dispatchEvent(new Event("resize")); }
  },
};
localize();
window.parent.postMessage({ type: "nhip-sylva-loaded" }, window.location.origin);
