import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir(".sites-runtime", { recursive: true });
await build({
  entryPoints: ["tests/club.test.ts"],
  outfile: ".sites-runtime/club-tests.mjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
});
await import("../.sites-runtime/club-tests.mjs?run=" + Date.now());
