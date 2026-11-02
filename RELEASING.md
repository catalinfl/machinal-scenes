# Releasing @machinal/scenes

Publishing is a maintainer action. The CI workflow does not publish to npm or require npm credentials.

## Validate

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm test:cli
pnpm test:go
pnpm test:package
npm pack --dry-run
```

Review the packed file list. Do not include credentials, local configuration, recordings or generated project media. The npm package deliberately contains generated `dist/` files, native renderers with notices and renderer sources; those generated artifacts are not checked into Git.

## Version

Choose a new unpublished semantic version. Keep the root `package.json` version and the `@machinal/scenes` dependency in `examples/quickstart/package.json` in sync, and update `CHANGELOG.md`. Internal workspaces are private and are not published separately.

Do not reuse an already published npm version. Source repository metadata changes do not retroactively modify an existing npm release.

## Publish

The publishing account needs access to the npm `@machinal` scope and the authentication required by npm's current publishing policy.

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami
npm publish --access public
```

`prepublishOnly` runs checks and tests, including real installed-package rendering. `prepack` rebuilds the library and all native targets. Do not bypass these checks for a release.

If using npm staged publishing instead, submit with `npm stage publish`, inspect the staged contents and approve them with 2FA through npm's Staged Packages page or CLI. A public `0.0.0-stage` placeholder is not the operational release.

After publication, verify `npm view @machinal/scenes version`. Tag the matching source commit and optionally create a GitHub release. Never commit npm tokens or registry credentials.
