import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const manifest = JSON.parse(await readFile("vendor/threeui/manifest.json", "utf8"));
for (const entry of [...manifest.files, ...manifest.assets]) {
  for (const path of [`vendor/threeui/upstream/${entry.path}`, ...(entry.path.startsWith("public/") ? [entry.path] : [])]) {
    const hash = createHash("sha256").update(await readFile(path)).digest("hex");
    if (hash !== entry.sha256) throw new Error(`ThreeUI source drift: ${path}`);
  }
}
await build({
  entryPoints: ["components/sylva/extension.ts"], outfile: "public/landing-pages/inner-green-assets/nhip-sylva.js",
  bundle: true, format: "iife", target: "es2020", minify: true,
  plugins: [{ name: "authored-three-runtime", setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: "three", namespace: "authored" }));
    build.onLoad({ filter: /.*/, namespace: "authored" }, () => ({ contents: "module.exports = window.THREE;", loader: "js" }));
  } }],
});
// Load the additive integration before the authored scene constructs its renderer.
// Keep the registered canonical document byte-exact and emit a derived app entry.
const source = await readFile("public/landing-pages/inner-green-3d.html", "utf8");
const anchor = '<script src="inner-green-assets/three.min.js"></script>';
if (source.split(anchor).length !== 2) throw new Error("Sylva runtime anchor must be unique");
const presentation = `<style id="nhip-background-presentation">
  html,body,.hero{height:100vh!important;min-height:100vh!important;overflow:hidden!important}
  .stage,.dock-wrap{visibility:hidden!important;pointer-events:none!important}
  @media(max-width:900px){.stage{position:absolute!important;top:50%!important;margin-top:calc(-680 * var(--u))!important;transform:translate(25vw,-90px)!important}}
</style>`;
await writeFile("public/landing-pages/nhip-living-green.html", source.replace("</head>", presentation + "</head>").replace(anchor, anchor + '\n<script id="nhip-sylva-extension" src="inner-green-assets/nhip-sylva.js"></script>'));
console.log("Sylva: exact registered files verified; continuous scene and cat integration built.");
