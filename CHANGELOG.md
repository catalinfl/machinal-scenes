# Changelog

## 0.1.1

- Show readable setup/doctor status and a concise render result by default; use `--json` for complete tool and scene metadata. The Node API and saved scene manifests are unchanged.
- Report the native renderer's real version instead of its help banner.
- Reuse cached tools without announcing another Chrome or FFmpeg installation; FFmpeg integrity and license checks still run.
- Fix negative preview frames when an animation timestamp precedes the Play click, including pause/resume and end-of-scene replay.
- Default the starter scene to 1280×720 and show the complete local export path; clarify that the standalone tool has no S3 upload or project connection.
- Styled, responsive quickstart workspace with preview transport and an in-browser local export panel.
- Explicit rendering-tool download, prerequisite checks, build/render status, actionable errors and completed MP4 downloads.
- Browser exports save unique videos and manifests in `renders/` without replacing earlier exports; CLI export remains available.

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
