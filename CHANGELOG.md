# Changelog

## 0.1.0

- Initial public `@machinal/scenes` distribution, combining the runtime and Svelte integration in one package.
- Root, `/runtime`, `/svelte` and `/node` entrypoints with TypeScript declarations.
- Frame-based seeking, resource readiness, CSS animation seeking and reproducible seeded randomness.
- Svelte 5 canvas, video and Three.js scene integration with choreography, geometry and object helpers.
- Standalone Vite quickstart, with no account or native-rendering setup required for preview.
- `machinal-scenes init <directory>` scaffolds the quickstart without overwriting existing directories or installing tools automatically.
- Precompiled Go renderers and their source/notices are included for Windows x64, Linux x64, macOS x64 and macOS arm64.
- Explicit `setup`, `doctor` and `render` commands plus Node `renderVideo()` export real H.264 MP4 and VP9/alpha WebM, without Go or a private service on the user's machine.
- Pinned native-tool provisioning retains FFmpeg license/build information and verifies its published release hashes.
- The starter builds a dedicated capture page, separate from preview UI, and includes `npm run render`.

The private Machinal service is not included in the npm distribution. External Chrome and FFmpeg programs retain their own licenses and are provisioned separately by `setup`.
