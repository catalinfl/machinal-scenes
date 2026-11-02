# Developing @machinal/scenes

This is the standalone public library repository. No application API, account, private service or monorepo checkout is needed.

## Requirements

- Node.js 22.12+ (Node.js 24 LTS is recommended for development)
- pnpm 11.9.0, as pinned in `package.json`
- Go 1.27.2+ to build the native renderer from source

Users of the published npm package do not need Go. Chromium and FFmpeg are provisioned explicitly by `setup`, not by dependency installation.

## Install, build and test

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm test:cli
pnpm test:go
pnpm build
pnpm build:renderer
```

`pnpm build` compiles the runtime and Svelte integration into one `dist/` distribution. The `@direction/scene-runtime` and `@direction/scene-svelte` names are private development workspaces, not additional published dependencies. The build rewrites their internal imports to relative distribution paths.

`pnpm build:renderer` cross-compiles Windows x64, Linux x64, macOS x64 and macOS arm64 executables into `native/`, with checksums and third-party notices. Generated binaries and distributions are not committed.

## Full installed-package verification

```sh
pnpm test:package
```

This builds the library and all native targets, packs a tarball, installs it in an isolated temporary consumer, scaffolds the quickstart, type-checks and builds it, explicitly provisions pinned Chromium/FFmpeg, and renders real MP4 and transparent WebM outputs. It also checks output preservation and Node rendering with Go removed from the consumer's PATH.

The test requires internet access and Chromium's system dependencies on Linux; see the README. It may take several minutes. Set `SCENE_PACKAGE_BROWSER=1` to also exercise interactive browser preview, seeking and playback. Set `SCENE_PACKAGE_KEEP=1` to retain the temporary consumer for inspection.

Some Go browser tests are opt-in: without `SCENE_BROWSER`, `SCENE_FFMPEG` and `SCENE_FIXTURE_DIR`, they are skipped. The installed-package test above performs native export without those variables.

## Try the quickstart

To use the currently published package:

```sh
npx @machinal/scenes init my-scene
cd my-scene
npm install
npm run dev
```

To try local changes, run `pnpm build` and `pnpm build:renderer`, then `npm pack --ignore-scripts` from the repository root. Scaffold a consumer outside this repository with `node bin/machinal-scenes.mjs init <directory>`, install that tarball in the consumer with `npm install /absolute/path/to/machinal-scenes-0.1.0.tgz`, then use the consumer's `npm run check`, `npm run dev`, `npm run setup` and `npm run render` scripts. Substitute the actual tarball filename if the version changes.

## Layout

| Path | Purpose |
| --- | --- |
| `runtime/src` | Framework-independent frame protocol, resources, geometry, choreography and validation |
| `svelte/src` | Svelte 5 scene components, mounting, Three.js integration and controlled asset loading |
| `node` | Local tool provisioning, checksums and rendering API |
| `bin` | `machinal-scenes` CLI |
| `renderer` | Independent Go module for capture, encoding and manifests |
| `examples/quickstart` | Standalone Svelte/Vite preview and dedicated capture page |
| `tests` | CLI, installed-tarball integration tests and public test fixtures |

Scenes execute code and are not a security sandbox. Use trusted sources or provide your own isolation and resource limits.
