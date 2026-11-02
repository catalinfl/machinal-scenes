import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { localExportPlugin } from '../examples/quickstart/tools/local-export.mjs';

const ready = { ready: true, renderer: { available: true }, browser: { available: true }, ffmpeg: { available: true } };
const missing = { ...ready, ready: false, browser: { available: false }, ffmpeg: { available: false } };
const prefix = '/__machinal/export/';

async function fixture(t, overrides = {}) {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'scenes-local-export-'));
  await writeFile(join(root, 'scene.config.json'), JSON.stringify({ url: '/scene.html', audio: [{ file: 'voice.wav' }] }));
  let middleware;
  const server = createServer((request, response) => middleware(request, response, () => { response.writeHead(404); response.end(); }));
  const plugin = localExportPlugin({
    build: async () => {},
    checkTools: async () => ready,
    installTools: async () => ready,
    render: async ({ output }) => { await writeFile(output, 'test-video'); },
    ...overrides,
  });
  plugin.configureServer({
    config: { root, configFile: join(root, 'vite.config.js') },
    httpServer: server,
    middlewares: { use: handler => { middleware = handler; } },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return {
    root,
    origin,
    get: action => fetch(`${origin}${prefix}${action}`),
    post: (action, headers = {}) => fetch(`${origin}${prefix}${action}`, { method: 'POST', headers: { Origin: origin, 'X-Machinal-Export': '1', ...headers } }),
  };
}

async function finished(app) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await (await app.get('status')).json();
    if (!['installing', 'building', 'rendering'].includes(result.job.phase)) return result;
    await setTimeout(5);
  }
  throw new Error('Local export did not settle');
}

test('checking prerequisites never downloads tools and rendering explains missing tools', async t => {
  let installs = 0;
  const app = await fixture(t, { checkTools: async () => missing, installTools: async () => { installs += 1; return ready; } });
  const status = await (await app.get('status')).json();
  assert.equal(status.tools.ready, false);
  assert.equal(installs, 0);
  const response = await app.post('render');
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Download rendering tools/);
  assert.equal((await app.get('video')).status, 404);
});

test('explicit setup reports progress, rejects duplicates and enables rendering', async t => {
  let complete;
  const app = await fixture(t, {
    checkTools: async () => missing,
    installTools: ({ onProgress }) => {
      onProgress('Downloading FFmpeg…');
      return new Promise(resolve => { complete = () => resolve(ready); });
    },
  });
  assert.equal((await app.post('setup')).status, 202);
  const installing = await (await app.get('status')).json();
  assert.equal(installing.job.phase, 'installing');
  assert.equal(installing.job.message, 'Downloading FFmpeg…');
  assert.equal((await app.post('setup')).status, 409);
  assert.equal((await app.post('render')).status, 409);
  complete();
  assert.equal((await finished(app)).tools.ready, true);
  assert.equal((await app.post('render')).status, 202);
  assert.equal((await finished(app)).job.phase, 'done');
});

test('local actions reject cross-origin, forged-host, GET and missing-header submissions', async t => {
  let installs = 0;
  const app = await fixture(t, { installTools: async () => { installs += 1; return ready; } });
  assert.equal((await app.post('setup', { Origin: 'https://untrusted.test' })).status, 403);
  assert.equal((await app.post('setup', { Host: 'untrusted.test', Origin: 'http://untrusted.test' })).status, 403);
  assert.equal((await app.post('setup', { 'X-Machinal-Export': '' })).status, 403);
  assert.equal((await app.get('setup')).status, 405);
  assert.equal((await app.post('unknown')).status, 404);
  assert.equal(installs, 0);
});

test('render builds the capture page, downloads real bytes and preserves previous exports', async t => {
  const builds = [];
  const renders = [];
  const app = await fixture(t, {
    build: async options => { builds.push(options); },
    render: async options => { renders.push(options); options.onProgress('frames 180/180'); await writeFile(options.output, 'test-video'); },
  });
  for (let index = 0; index < 2; index += 1) {
    assert.equal((await app.post('render')).status, 202);
    const result = await finished(app);
    assert.equal(result.job.phase, 'done');
    assert.match(result.job.filename, /^scene-[a-f0-9-]+\.mp4$/);
    assert.equal(result.job.localFile, join(app.root, 'renders', result.job.filename));
    const download = await app.get('video');
    assert.equal(download.headers.get('content-type'), 'video/mp4');
    assert.match(download.headers.get('content-disposition'), /attachment; filename="scene-/);
    assert.equal(await download.text(), 'test-video');
    assert.equal(await readFile(join(app.root, 'renders', result.job.filename), 'utf8'), 'test-video');
  }
  assert.equal((await readdir(join(app.root, 'renders'))).length, 2);
  assert.notEqual(renders[0].output, renders[1].output);
  assert.equal(renders[0].request.audio[0].file, join(app.root, 'voice.wav'));
  assert.equal(renders[0].request.url, '/scene.html');
  assert.equal(builds[0].build.outDir, renders[0].serveDirectory);
  await assert.rejects(readdir(builds[0].build.outDir), { code: 'ENOENT' });
});

test('setup and render failures are visible and can be retried', async t => {
  let failed = true;
  const app = await fixture(t, {
    installTools: async () => { throw new Error('Download unavailable. Check your connection.'); },
    build: async () => { if (failed) throw new Error('Invalid Svelte source'); },
  });
  await app.post('setup');
  assert.match((await finished(app)).job.message, /Download unavailable/);
  await app.post('render');
  assert.deepEqual((await finished(app)).job, { phase: 'error', message: 'Invalid Svelte source' });
  assert.equal((await app.get('video')).status, 404);
  failed = false;
  await app.post('render');
  assert.equal((await finished(app)).job.phase, 'done');
});
