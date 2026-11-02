export const rendererTargets = [
  { platform: 'win32', arch: 'x64', goos: 'windows', goarch: 'amd64', file: 'win32-x64/scene-render.exe' },
  { platform: 'linux', arch: 'x64', goos: 'linux', goarch: 'amd64', file: 'linux-x64/scene-render' },
  { platform: 'darwin', arch: 'x64', goos: 'darwin', goarch: 'amd64', file: 'darwin-x64/scene-render' },
  { platform: 'darwin', arch: 'arm64', goos: 'darwin', goarch: 'arm64', file: 'darwin-arm64/scene-render' },
];

export function platformTarget(platform = process.platform, arch = process.arch) {
  const target = rendererTargets.find(target => target.platform === platform && target.arch === arch);
  if (!target) {
    throw new Error(`Native rendering is not supported on ${platform}-${arch}. Supported: ${rendererTargets.map(target => `${target.platform}-${target.arch}`).join(', ')}. Browser authoring/preview remains available.`);
  }
  return target;
}
