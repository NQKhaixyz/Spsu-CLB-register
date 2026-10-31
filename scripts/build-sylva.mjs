import { build } from "esbuild";
import { readFile } from "node:fs/promises";
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
console.log("Sylva: registered source/assets verified; cat extension built with the authored local Three.js.");
