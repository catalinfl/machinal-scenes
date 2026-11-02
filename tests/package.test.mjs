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

function command(name, args, cwd, env = {}) {
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
      else resolve(stdout);
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
  for (const required of ['bin/machinal-scenes.mjs', 'node/index.mjs', 'node/index.d.ts', 'native/manifest.json', 'native/THIRD_PARTY_NOTICES.txt', ...rendererTargets.map(target => `native/${target.file}`), 'dist/index.js', 'dist/index.d.ts', 'dist/runtime/index.js', 'dist/svelte/index.js', 'LICENSE', 'NOTICE', 'LICENSING.md', 'README.md', 'examples/quickstart/src/main.ts', 'examples/quickstart/scene.html', 'examples/quickstart/scene.config.json']) {
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
  await command('npm', ['run', 'setup'], consumer, toolsEnv);
  const tools = JSON.parse(await command('npm', ['exec', '--offline', '--', 'machinal-scenes', 'doctor'], consumer, toolsEnv));
  assert.equal(tools.ready, true);
  if (process.env.SCENE_PACKAGE_BROWSER === '1') await checkBrowser(consumer, tools.browser.path);
  await command('npm', ['run', 'render'], consumer, toolsEnv);
  const video = JSON.parse(await readFile(join(consumer, 'scene.mp4.scene.json'), 'utf8'));
  assert.equal(video.width, 640);
  assert.equal(video.height, 360);
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
  await command(process.execPath, [join(consumer, 'node_modules/@machinal/scenes/bin/machinal-scenes.mjs'), 'render', '--request', 'transparent.json', '--output', 'transparent.webm'], consumer, noGoEnv);
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
      'Content-Type': request.url?.endsWith('.js') ? 'text/javascript' : request.url?.endsWith('.css') ? 'text/css' : 'text/html',
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
    await page.evaluate(() => window.__scene.seek(30));
    assert.equal(await page.locator('[data-scene-object="title"]').evaluate(element => element.style.transform), 'translateX(80px)');
    await page.evaluate(() => window.__scene.seek(0));
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#frame').value) >= 2);
    await page.locator('#play').click();
    await page.goto(`http://127.0.0.1:${address.port}/scene.html`);
    await page.waitForFunction(() => window.__scene);
    assert.equal(await page.locator('#play').count(), 0);
    assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).margin), '0px');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
