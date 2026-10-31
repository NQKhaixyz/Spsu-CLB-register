# SylvaHero · Living Green

Registered source revision: `05f359ce157a`.

Sources supplied by the site owner:
- https://threeui.com/source-code/sylva-hero.json
- https://threeui.com/landing-pages/inner-green-3d.html

`upstream/` preserves all seven registered source files and three binary assets,
with SHA-256 digests in `manifest.json`. The hosted HTML replaced its three local
asset URLs with image-CDN URLs and added two `crossorigin` attributes. Restoring
the original local paths and removing those two attributes reproduced the exact
registered HTML digest `69c3694bd63f44ef9f007ebe4dac57a83e4402e0cdf6b54dd10b96dd4f05e197`.

The canonical HTML, its local Three.js runtime and binary assets in `public/`
also remain byte-exact. `scripts/build-sylva.mjs` checks both sets before builds.

`index.tsx` extracts the Living Green branch of the registered component, using
the original frame, typography controls and recipes. In the executable copy of
`pageTypography.ts`, two DOM `append(node)` calls use the equivalent
`appendChild(node)` to avoid the project's Cloudflare `Element` type collision;
the registered upstream copy remains untouched. Other variants and their
unrelated dependencies are intentionally outside this site's entry. The Vite
and TypeScript aliases preserve the requested `@designcodeio/threeui` imports.

The build emits `public/landing-pages/nhip-living-green.html` from the verified
canonical document. Its two additions are background presentation CSS and a
script tag immediately after the local Three.js runtime. Loading the integration
before scene initialization is necessary: r149 defines `render` on each renderer
instance, so patching the prototype after startup does not work.

`components/sylva/extension.ts` adds two articulated cats to the existing root
group using the authored Three runtime and samples their walking height from
the actual root mesh. The original world, shaders, pollen, flowers and butterfly
remain. The user's revised design removes the authored marketing UI, time
selectors and separate garden mode. The scene runs continuously behind a single
CLB interface, respecting the device's reduced-motion preference. No documentation
page is embedded and no replacement forest is drawn.

The iframe is the component's original `LandingPageFrame`, served from this
site. It is decorative, excluded from keyboard navigation, and receives no
credentials. The native login form is immediately available in the app.
