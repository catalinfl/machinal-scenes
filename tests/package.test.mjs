import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import crossSpawn from 'cross-spawn';
import { rendererTargets } from '../node/platforms.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function command(name, args, cwd, env = {}, capture = false) {
  return new Promise((resolve, reject) => {
    const child = crossSpawn(name, args, {
      cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) reject(new Error(`${name} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`));
      else resolve(capture ? { stdout, stderr } : stdout);
    });
  });
}

function checkContents(packed, manifest) {
  assert.equal(packed.name, '@machinal/scenes');
  assert.equal(packed.version, manifest.version);
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.publishConfig.access, 'public');
  assert.equal(manifest.bin['machinal-scenes'], 'bin/machinal-scenes.mjs');
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.scripts.preinstall, undefined);
  assert.equal(manifest.scripts.install, undefined);
  assert.equal(manifest.scripts.postinstall, undefined);
  const paths = packed.files.map(file => file.path);
  for (const required of ['bin/machinal-scenes.mjs', 'node/index.mjs', 'node/index.d.ts', 'native/manifest.json', 'native/THIRD_PARTY_NOTICES.txt', ...rendererTargets.map(target => `native/${target.file}`), 'dist/index.js', 'dist/index.d.ts', 'dist/runtime/index.js', 'dist/svelte/index.js', 'LICENSE', 'NOTICE', 'LICENSING.md', 'README.md', 'examples/quickstart/src/main.ts', 'examples/quickstart/src/playback.ts', 'examples/quickstart/src/workspace.css', 'examples/quickstart/src/ExportPanel.svelte', 'examples/quickstart/tools/local-export.mjs', 'examples/quickstart/gitignore', 'examples/quickstart/scene.html', 'examples/quickstart/scene.config.json']) {
    assert.ok(paths.includes(required), `Missing ${required}`);
  }
  for (const path of paths) {
    assert.match(path, /^(?:bin\/machinal-scenes\.mjs$|node\/|native\/|renderer\/(?:.*\.go|go\.mod|go\.sum)$|dist\/|examples\/quickstart\/|package\.json$|README\.md$|LICENSE$|NOTICE$|LICENSING\.md$|CHANGELOG\.md$)/, `Unexpected published file: ${path}`);
    assert.doesNotMatch(path, /(?:node_modules|\.env|\.mp4$|\.webm$|\.scene\.json$)/);
    if (path.endsWith('.exe')) assert.ok(rendererTargets.some(target => path === `native/${target.file}`));
    if (path.startsWith('native/')) assert.ok(['native/manifest.json', 'native/THIRD_PARTY_NOTICES.txt', ...rendererTargets.map(target => `native/${target.file}`)].includes(path), `Unexpected native artifact: ${path}`);
  }
  for (const dependencies of [manifest.dependencies, manifest.peerDependencies]) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      assert.ok(!name.startsWith('@direction/'), `Private dependency: ${name}`);
      assert.doesNotMatch(version, /^(?:workspace:|file:|link:)/);
    }
  }
}

test('the installed tarball scaffolds, provisions tools and exports real MP4 and alpha WebM without Go', { timeout: 900_000 }, async t => {
  const temporaryRoot = join(tmpdir(), 'opencode');
  await mkdir(temporaryRoot, { recursive: true });
  const workspace = await mkdtemp(join(temporaryRoot, 'machinal-scenes-package-'));
  let passed = false;
  t.after(async () => {
    if (passed && process.env.SCENE_PACKAGE_KEEP !== '1') await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    else console.error(`Package test workspace retained: ${workspace}`);
  });

  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const [packed] = JSON.parse(await command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', workspace], root));
  checkContents(packed, manifest);
  const tarball = join(workspace, packed.filename);
  const installer = join(workspace, 'installer');
  await mkdir(installer);
  await writeFile(join(installer, 'package.json'), '{"name":"scenes-install-test","private":true,"type":"module"}', 'utf8');
  await command('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], installer);
  assert.equal((await command('npm', ['exec', '--offline', '--', 'machinal-scenes', '--version'], installer)).trim(), manifest.version);
  assert.match(await command('npm', ['exec', '--offline', '--', 'machinal-scenes', '--help'], installer), /init <directory>/);
  await assert.rejects(command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'unknown'], installer), /Expected a supported command/);
  const consumer = join(workspace, 'consumer');
  await command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'init', consumer], installer);
  await assert.rejects(command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'init', consumer], installer), /Destination already exists/);
  const quickstart = JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8'));
  assert.equal(quickstart.dependencies['@machinal/scenes'], `^${manifest.version}`);
  assert.match(await readFile(join(consumer, '.gitignore'), 'utf8'), /renders\//);

  await command('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
  await writeFile(join(consumer, 'src/node-api-check.ts'), `import { renderVideo, setup, doctor, type RenderOptions } from '@machinal/scenes/node';\nexport const options: RenderOptions = { request: 'scene.config.json', output: 'output.mp4' };\nexport { renderVideo, setup, doctor };\n`, 'utf8');
  for (const file of packed.files.filter(file => file.path.startsWith('dist/'))) {
    const source = await readFile(join(consumer, 'node_modules/@machinal/scenes', file.path), 'utf8');
    assert.doesNotMatch(source, /@direction\/scene-/, `Private workspace import in ${file.path}`);
  }
  await command(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { interpolate, PROTOCOL_VERSION, validateRequest } from '@machinal/scenes/runtime';
    assert.equal(PROTOCOL_VERSION, 1);
    assert.equal(interpolate(30, [0, 60], [0, 200]), 100);
    validateRequest({ version: 1, sceneId: 'title', config: { width: 640, height: 360, fps: 30, durationInFrames: 180 } });
    await assert.rejects(import('@machinal/scenes/dist/runtime/index.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  `], consumer);
  await command('npm', ['run', 'check'], consumer);
  await command('npm', ['run', 'build'], consumer);
  const toolsEnv = { MACHINAL_SCENES_CACHE: join(temporaryRoot, 'machinal-scenes-tool-cache'), SCENE_BROWSER: '', SCENE_FFMPEG: '' };
  const setupOutput = await command('npm', ['run', 'setup'], consumer, toolsEnv);
  assert.match(setupOutput, /Rendering tools are ready/);
  assert.doesNotMatch(setupOutput, /"cacheDirectory"|"renderer"|Copyright|Usage of/);
  const repeatedSetup = await command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'setup', '--json'], consumer, toolsEnv, true);
  assert.equal(JSON.parse(repeatedSetup.stdout).ready, true);
  assert.doesNotMatch(repeatedSetup.stderr, /Installing/);
  assert.match(await command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'doctor'], consumer, toolsEnv), /FFmpeg: ready/);
  const tools = JSON.parse(await command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'doctor', '--json'], consumer, toolsEnv));
  assert.equal(tools.ready, true);
  assert.equal(tools.renderer.version, `machinal-scene-render ${manifest.version}`);
  if (process.env.SCENE_PACKAGE_BROWSER === '1') {
    await checkBrowser(consumer, tools.browser.path);
    await checkBrowserExport(consumer, tools, toolsEnv);
  }
  const renderOutput = await command('npm', ['run', 'render'], consumer, toolsEnv);
  assert.ok(renderOutput.includes(`Rendered ${join(consumer, 'scene.mp4')}`));
  assert.match(renderOutput, /1280 × 720 · 30 fps · 6 s/);
  assert.doesNotMatch(renderOutput, /"sha256"|"scene"|"metrics"|elapsedNanoseconds/);
  const video = JSON.parse(await readFile(join(consumer, 'scene.mp4.scene.json'), 'utf8'));
  assert.equal(video.width, 1280);
  assert.equal(video.height, 720);
  assert.equal(video.duration, 6);
  assert.equal(video.frames, 180);
  assert.equal(video.codec, 'h264');
  const decoded = execFileSync(tools.ffmpeg.path, ['-v', 'error', '-i', join(consumer, 'scene.mp4'), '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const frames = decoded.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  assert.equal(frames.length, 180);
  assert.notEqual(frames[0].split(',').at(-1), frames[60].split(',').at(-1));
  const firstPixel = execFileSync(tools.ffmpeg.path, ['-v', 'error', '-i', join(consumer, 'scene.mp4'), '-vf', 'format=rgb24,crop=1:1:0:0', '-frames:v', '1', '-f', 'rawvideo', '-']);
  for (const [index, expected] of [245, 242, 235].entries()) assert.ok(Math.abs(firstPixel[index] - expected) < 6, 'Export must capture the scene, not white preview UI');
  await assert.rejects(command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'render'], consumer, toolsEnv), /Output already exists/);
  const request = JSON.parse(await readFile(join(consumer, 'scene.config.json'), 'utf8'));
  request.config.transparent = true;
  request.config.durationInFrames = 6;
  await writeFile(join(consumer, 'transparent.json'), JSON.stringify(request), 'utf8');
  const emptyPath = join(workspace, 'empty-path');
  await mkdir(emptyPath);
  const noGoEnv = { ...toolsEnv, PATH: emptyPath, Path: emptyPath };
  const unavailableGo = spawnSync('go', ['version'], { cwd: consumer, env: { ...process.env, ...noGoEnv } });
  assert.equal(unavailableGo.error?.code, 'ENOENT', 'Native export must be tested with Go unavailable');
  const jsonRender = JSON.parse(await command(process.execPath, [join(consumer, 'node_modules/@machinal/scenes/bin/machinal-scenes.mjs'), 'render', '--request', 'transparent.json', '--output', 'transparent.webm', '--json'], consumer, noGoEnv));
  assert.equal(jsonRender.codec, 'vp9');
  assert.equal(jsonRender.frames, 6);
  assert.equal(jsonRender.scene.sceneId, request.sceneId);
  const alpha = execFileSync(tools.ffmpeg.path, ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', join(consumer, 'transparent.webm'), '-vf', 'alphaextract', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1024 * 1024 });
  assert.ok(alpha.includes(0), 'Transparent WebM must contain actual transparent pixels');
  assert.ok(alpha.includes(255), 'Transparent WebM must retain its visible subject');
  const fromNode = JSON.parse(await command(process.execPath, ['--input-type=module', '--eval', `
    import { readFile } from 'node:fs/promises';
    import { renderVideo } from '@machinal/scenes/node';
    const request = JSON.parse(await readFile('scene.config.json', 'utf8'));
    request.config.durationInFrames = 6;
    const asset = await renderVideo({ request, output: 'node-api.mp4' });
    console.log(JSON.stringify(asset));
  `], consumer, noGoEnv));
  assert.equal(fromNode.frames, 6);
  assert.equal(fromNode.codec, 'h264');
  passed = true;
});

async function checkBrowser(consumer, executablePath) {
  const { chromium } = await import('@playwright/test');
  const { readdir } = await import('node:fs/promises');
  const assets = new Map([['/', await readFile(join(consumer, 'dist/index.html'))], ['/scene.html', await readFile(join(consumer, 'dist/scene.html'))]]);
  for (const name of await readdir(join(consumer, 'dist/assets'))) {
    assets.set(`/assets/${name}`, await readFile(join(consumer, 'dist/assets', name)));
  }
  const server = createServer((request, response) => {
    const file = assets.get(request.url);
    response.writeHead(file ? 200 : 404, {
      'Content-Type': request.url?.endsWith('.js') ? 'text/javascript' : request.url?.endsWith('.css') ? 'text/css' : request.url?.endsWith('.woff2') ? 'font/woff2' : 'text/html',
    });
    response.end(file ?? 'Not found');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    browser = await chromium.launch({ executablePath });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => window.__scene && !document.querySelector('#play').disabled);
    assert.match(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily), /IBM Plex Sans/);
    await page.getByRole('alert').filter({ hasText: 'npm run dev' }).waitFor();
    await page.evaluate(() => window.__scene.seek(30));
    assert.equal(await page.locator('[data-scene-object="title"]').evaluate(element => element.style.transform), 'translateX(160px)');
    await checkPlayback(page);
    await page.goto(`http://127.0.0.1:${address.port}/scene.html`);
    await page.waitForFunction(() => window.__scene);
    assert.equal(await page.locator('#play').count(), 0);
    assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).margin), '0px');
    assert.deepEqual(await page.evaluate(() => window.__scene.manifest.config), { width: 1280, height: 720, fps: 30, durationInFrames: 180 });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function checkPlayback(page) {
  const { expect } = await import('@playwright/test');
  await page.evaluate(() => {
    window.playbackFrames = [];
    window.earlyTimestamp = false;
    const seek = window.__scene.seek.bind(window.__scene);
    window.__scene.seek = (frame, options) => {
      window.playbackFrames.push(frame);
      return seek(frame, options);
    };
    const schedule = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => schedule(timestamp => {
      if (window.earlyTimestamp) {
        window.earlyTimestamp = false;
        callback(performance.now() - 100);
      } else callback(timestamp);
    });
  });
  for (const [selected, expected] of [[0, 0], [60, 60], [179, 0]]) {
    await page.locator('#frame').fill(String(selected));
    await expect(page.locator('#counter')).toHaveText(`${String(selected).padStart(3, '0')} / 179`);
    await page.evaluate(() => { window.playbackFrames = []; window.earlyTimestamp = true; });
    await page.locator('#play').click();
    await expect.poll(() => page.evaluate(() => window.playbackFrames[0])).toBe(expected);
    await expect.poll(async () => Number(await page.locator('#frame').inputValue())).toBeGreaterThanOrEqual(expected + 2);
    await expect(page.locator('#status')).toContainText('Preview ready.');
    await page.locator('#play').click();
    assert.equal(await page.locator('#play').textContent(), 'Play');
    const attempted = await page.evaluate(() => window.playbackFrames);
    assert.ok(attempted.every(frame => Number.isInteger(frame) && frame >= expected && frame <= 179));
  }
  await page.locator('#reset').click();
  await expect(page.locator('#counter')).toHaveText('000 / 179');
}

async function checkBrowserExport(consumer, tools, env) {
  const { chromium, expect } = await import('@playwright/test');
  const child = crossSpawn(process.execPath, [join(consumer, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '0'], {
    cwd: consumer, env: { ...process.env, ...env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Vite did not start: ${output}`)), 30_000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Vite exited (${code}): ${output}`)); });
      child.stderr.on('data', chunk => { output += chunk; });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
    });
    browser = await chromium.launch({ executablePath: tools.browser.path });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const errors = [];
    const remoteRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) remoteRequests.push(request.url());
    });
    await page.goto(origin);
    await expect(page.getByRole('button', { name: 'Render MP4', exact: true })).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('#dimensions')).toHaveText('1280 × 720 · 30 fps');
    assert.equal(await page.locator('#scene').evaluate(element => element.style.width), '1280px');
    assert.equal(await page.locator('#scene').evaluate(element => element.style.height), '720px');
    await checkPlayback(page);
    await page.locator('#frame').fill('60');
    await expect(page.locator('#counter')).toHaveText('060 / 179');
    await mkdir(join(root, 'test-results/quickstart'), { recursive: true });
    await page.screenshot({ path: join(root, 'test-results/quickstart/desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(root, 'test-results/quickstart/mobile.png'), fullPage: true });

    await page.route('**/__machinal/export/render', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary render failure. Retry the connection.' }) }), { times: 1 });
    await page.getByRole('button', { name: 'Render MP4', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Temporary render failure');
    await page.getByRole('button', { name: 'Retry connection' }).click();
    await expect(page.getByRole('button', { name: 'Render MP4', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Render MP4', exact: true }).click();
    const link = page.getByRole('link', { name: 'Download MP4' });
    await expect(link).toBeVisible({ timeout: 120_000 });
    const downloadEvent = page.waitForEvent('download');
    await link.click();
    const download = await downloadEvent;
    const filename = download.suggestedFilename();
    assert.match(filename, /^scene-[a-f0-9-]+\.mp4$/);
    assert.deepEqual(await readFile(await download.path()), await readFile(join(consumer, 'renders', filename)));
    const manifest = JSON.parse(await readFile(join(consumer, 'renders', `${filename}.scene.json`), 'utf8'));
    assert.equal(manifest.frames, 180);
    assert.equal(manifest.codec, 'h264');
    assert.equal(manifest.width, 1280);
    assert.equal(manifest.height, 720);
    await expect(page.getByText('Saved on this computer:')).toContainText(join(consumer, 'renders', filename));
    const firstPixel = execFileSync(tools.ffmpeg.path, ['-v', 'error', '-i', join(consumer, 'renders', filename), '-vf', 'format=rgb24,crop=1:1:0:0', '-frames:v', '1', '-f', 'rawvideo', '-']);
    for (const [index, expected] of [245, 242, 235].entries()) assert.ok(Math.abs(firstPixel[index] - expected) < 6);
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, [], 'Standalone preview and export must not contact S3 or a project service');

    const onboarding = await browser.newPage();
    let installed = false;
    const ready = { ready: true, renderer: { available: true }, browser: { available: true }, ffmpeg: { available: true } };
    await onboarding.route('**/__machinal/export/status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tools: installed ? ready : { ...ready, ready: false, browser: { available: false }, ffmpeg: { available: false } }, job: { phase: 'idle' } }) }));
    await onboarding.route('**/__machinal/export/setup', route => {
      installed = true;
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ tools: ready, job: { phase: 'installing', message: 'Downloading tools…' } }) });
    });
    await onboarding.goto(origin);
    await expect(onboarding.getByRole('button', { name: 'Render MP4', exact: true })).toBeDisabled();
    await onboarding.getByRole('button', { name: 'Download rendering tools', exact: true }).click();
    await expect(onboarding.getByRole('button', { name: 'Render MP4', exact: true })).toBeEnabled();
    assert.equal(installed, true);
  } finally {
    await browser?.close();
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
  }
}
