import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { downloadVerified } from '../node/download.mjs';
import { formatRenderResult, formatToolchainStatus } from '../node/cli-output.mjs';
import { platformTarget, rendererTargets } from '../node/platforms.mjs';
import { renderVideo } from '../node/render.mjs';
import { cacheDirectory } from '../node/toolchain.mjs';

async function temporary(t) {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'scenes-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return directory;
}

test('tool summaries show readiness without dumping paths or version banners', () => {
  const available = { available: true, path: '/private/tool', version: 'verbose build metadata' };
  const output = formatToolchainStatus({ ready: true, cacheDirectory: '/private/cache', renderer: available, browser: available, ffmpeg: available });
  assert.equal(output, 'Rendering tools are ready.\n  Renderer: ready\n  Chrome Headless Shell: ready\n  FFmpeg: ready');
  assert.doesNotMatch(output, /private|version|metadata|\{/);
});

test('tool summaries retain actionable failures', () => {
  const output = formatToolchainStatus({ ready: false, renderer: { available: true }, browser: { available: false, error: 'Not installed. Run machinal-scenes setup.' }, ffmpeg: { available: false } });
  assert.match(output, /Rendering tools are not ready/);
  assert.match(output, /Chrome Headless Shell: Not installed. Run machinal-scenes setup/);
  assert.match(output, /FFmpeg: not available/);
});

test('render summaries identify the video without dumping scene parameters or metrics', () => {
  const output = formatRenderResult({ file: '/output/scene.mp4', width: 1280, height: 720, fps: 30, duration: 6, scene: { props: { secret: 'internal' } }, metrics: { workers: 2 } });
  assert.equal(output, 'Rendered /output/scene.mp4\n1280 × 720 · 30 fps · 6 s');
  assert.doesNotMatch(output, /props|secret|metrics|workers|\{/);
});

test('native target selection is explicit and unsupported platforms fail clearly', () => {
  assert.equal(rendererTargets.length, 4);
  assert.equal(platformTarget('win32', 'x64').file, 'win32-x64/scene-render.exe');
  assert.equal(platformTarget('darwin', 'arm64').goarch, 'arm64');
  assert.throws(() => platformTarget('linux', 'arm64'), /not supported/);
});

test('a caller-selected tool cache is honored', async t => {
  const directory = await temporary(t);
  assert.equal(cacheDirectory({ cacheDirectory: directory }), directory);
});

test('verified downloads reject changed bytes and do not publish partial files', async t => {
  const directory = await temporary(t);
  const destination = join(directory, 'tool');
  await assert.rejects(downloadVerified('https://example.test/tool', destination, '0'.repeat(64), async () => new Response('changed')), /SHA-256 mismatch/);
  assert.deepEqual(await readdir(directory), []);
});

test('verified downloads preserve an existing destination', async t => {
  const directory = await temporary(t);
  const destination = join(directory, 'tool');
  await writeFile(destination, 'original', 'utf8');
  const bytes = Buffer.from('verified');
  const digest = createHash('sha256').update(bytes).digest('hex');
  await assert.rejects(downloadVerified('https://example.test/tool', destination, digest, async () => new Response(bytes)), { code: 'EEXIST' });
  assert.equal(await readFile(destination, 'utf8'), 'original');
  assert.deepEqual(await readdir(directory), ['tool']);
});

test('verified downloads accept exactly the pinned bytes and require HTTPS', async t => {
  const directory = await temporary(t);
  const bytes = Buffer.from('verified');
  const digest = createHash('sha256').update(bytes).digest('hex');
  await downloadVerified('https://example.test/tool', join(directory, 'tool'), digest, async () => new Response(bytes));
  assert.equal(await readFile(join(directory, 'tool'), 'utf8'), 'verified');
  await assert.rejects(downloadVerified('http://example.test/tool', join(directory, 'unsafe'), digest), /require HTTPS/);
});

test('rendering refuses existing video and manifest files before starting tools', async t => {
  const directory = await temporary(t);
  const output = join(directory, 'scene.mp4');
  await writeFile(output, 'original', 'utf8');
  await assert.rejects(renderVideo({ request: 'unused.json', output }), /Output already exists/);
  assert.equal(await readFile(output, 'utf8'), 'original');
  const other = join(directory, 'other.mp4');
  await writeFile(`${other}.scene.json`, 'original', 'utf8');
  await assert.rejects(renderVideo({ request: 'unused.json', output: other }), /Output already exists/);
  await assert.rejects(renderVideo({ request: 'unused.json', output: join(directory, 'unsupported.png') }), /Output must be/);
  await assert.rejects(renderVideo({ request: 'unused.json', output: other + '.mp4', workers: 17 }), /workers must be/);
});
