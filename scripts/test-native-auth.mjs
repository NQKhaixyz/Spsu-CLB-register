import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir(".sites-runtime", { recursive: true });
await build({
  entryPoints: ["tests/native-auth.test.ts"],
  outfile: ".sites-runtime/native-auth-tests.mjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  plugins: [{
    name: "native-auth-isolated-d1",
    setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "test-env" }));
      build.onLoad({ filter: /.*/, namespace: "test-env" }, () => ({
        contents: "export const env=new Proxy({}, {get(_target,key){return globalThis.__nativeAuthTestEnv[key]}});",
        loader: "js",
      }));
    },
  }],
});
await import("../.sites-runtime/native-auth-tests.mjs?run=" + Date.now());
