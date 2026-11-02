import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';
import { Browser, computeExecutablePath, install } from '@puppeteer/browsers';
import { downloadVerified, sha256 } from './download.mjs';
import { ffmpegRelease, ffmpegReleases } from './ffmpeg-releases.mjs';
import { platformTarget } from './platforms.mjs';

export const browserBuild = '151.0.7922.34';
const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));

export function cacheDirectory(options = {}) {
  if (options.cacheDirectory || process.env.MACHINAL_SCENES_CACHE) return resolve(options.cacheDirectory || process.env.MACHINAL_SCENES_CACHE);
  const base = process.platform === 'win32' ? process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local')
    : process.platform === 'darwin' ? join(homedir(), 'Library/Caches')
      : process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  return join(base, 'machinal-scenes');
}

export function toolPaths(options = {}) {
  platformTarget();
  const cache = cacheDirectory(options);
  return {
    cache,
    browser: resolve(options.browserExecutable || process.env.SCENE_BROWSER || computeExecutablePath({ browser: Browser.CHROMEHEADLESSSHELL, buildId: browserBuild, cacheDir: join(cache, 'browser') })),
    ffmpeg: resolve(options.ffmpegExecutable || process.env.SCENE_FFMPEG || join(cache, 'ffmpeg', ffmpegRelease, `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')),
  };
}

export async function rendererPath() {
  const target = platformTarget();
  const manifest = JSON.parse(await readFile(join(packageRoot, 'native/manifest.json'), 'utf8').catch(error => {
    throw new Error(`This installation is missing the precompiled renderer manifest. Install a complete @machinal/scenes release. (${error.code})`);
  }));
  const entry = manifest.targets.find(entry => entry.platform === target.platform && entry.arch === target.arch);
  if (!entry || entry.file !== target.file) throw new Error('Missing native renderer for this platform');
  const executable = join(packageRoot, 'native', entry.file);
  if (await sha256(executable) !== entry.sha256) throw new Error('Native renderer checksum mismatch; reinstall the package');
  return executable;
}

async function probe(path, args) {
  try {
    await access(path);
    const { stdout, stderr } = await execute(path, args, { timeout: 15_000, maxBuffer: 128 * 1024, windowsHide: true });
    return { path, available: true, version: (stdout || stderr).split(/\r?\n/)[0] };
  } catch (error) {
    return { path, available: false, error: error.code === 'ENOENT' ? 'Not installed. Run machinal-scenes setup.' : `Cannot execute tool: ${error.message}` };
  }
}

export async function doctor(options = {}) {
  const paths = toolPaths(options);
  let renderer;
  try { renderer = await probe(await rendererPath(), ['-version']); }
  catch (error) { renderer = { available: false, error: error.message }; }
  const [browser, ffmpeg] = await Promise.all([probe(paths.browser, ['--version']), probe(paths.ffmpeg, ['-version'])]);
  return { ready: renderer.available && browser.available && ffmpeg.available, cacheDirectory: paths.cache, renderer, browser, ffmpeg };
}

export async function setup(options = {}) {
  const paths = toolPaths(options);
  await rendererPath();
  const report = options.onProgress ?? (() => {});
  if (!options.browserExecutable && !process.env.SCENE_BROWSER && !await isInstalled(paths.browser)) {
    report(`Installing Chrome Headless Shell ${browserBuild} (official Chrome for Testing download)...`);
    await install({ browser: Browser.CHROMEHEADLESSSHELL, buildId: browserBuild, cacheDir: join(paths.cache, 'browser'), installDeps: false });
  }
  if (!options.ffmpegExecutable && !process.env.SCENE_FFMPEG) {
    await installFFmpeg(paths.ffmpeg, report);
  }
  const status = await doctor(options);
  if (!status.ready) throw new Error(`Rendering tools are not ready:\n${[status.renderer, status.browser, status.ffmpeg].filter(tool => !tool.available).map(tool => `${tool.path ?? 'renderer'}: ${tool.error}`).join('\n')}\nOn Linux, Chromium also requires system shared libraries; see the README.`);
  return status;
}

async function isInstalled(executable) {
  try { await access(executable); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function installFFmpeg(executable, report) {
  const target = `${process.platform}-${process.arch}`;
  const hashes = ffmpegReleases[target];
  const directory = dirname(executable);
  try {
    const installed = JSON.parse(await readFile(join(directory, 'installation.json'), 'utf8'));
    if (installed.archiveSHA256 !== hashes.archive || await sha256(executable) !== installed.executableSHA256) throw new Error(`Cached FFmpeg checksum mismatch: ${directory}`);
    if (await sha256(join(directory, 'LICENSE')) !== hashes.license || await sha256(join(directory, 'README')) !== hashes.readme) throw new Error(`Cached FFmpeg license/build information is damaged: ${directory}`);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  report(`Installing FFmpeg ${ffmpegRelease} (checksum-verified release, including license and build information)...`);
  await mkdir(dirname(directory), { recursive: true });
  const temporary = await mkdtemp(join(dirname(directory), '.install-'));
  const base = `https://github.com/eugeneware/ffmpeg-static/releases/download/${ffmpegRelease}`;
  try {
    await downloadVerified(`${base}/ffmpeg-${target}.gz`, join(temporary, 'ffmpeg.gz'), hashes.archive);
    await downloadVerified(`${base}/${target}.LICENSE`, join(temporary, 'LICENSE'), hashes.license);
    await downloadVerified(`${base}/${target}.README`, join(temporary, 'README'), hashes.readme);
    const binary = join(temporary, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    await pipeline(createReadStream(join(temporary, 'ffmpeg.gz')), createGunzip(), createWriteStream(binary, { flags: 'wx' }));
    await chmod(binary, 0o755);
    await writeFile(join(temporary, 'installation.json'), JSON.stringify({ archiveSHA256: hashes.archive, executableSHA256: await sha256(binary) }), 'utf8');
    await rm(join(temporary, 'ffmpeg.gz'));
    await rename(temporary, directory);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
