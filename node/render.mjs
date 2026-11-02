import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseRenderedSceneAsset, validateRequest } from '../dist/runtime/index.js';
import { doctor } from './toolchain.mjs';

export async function renderVideo(options) {
  if (!options?.request) throw new Error('A render request filename or object is required');
  const output = resolve(options.output ?? 'scene.mp4');
  if (!/\.(mp4|webm)$/i.test(output)) throw new Error('Output must be a new .mp4 or .webm file');
  for (const path of [output, `${output}.scene.json`]) {
    try { await access(path); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Output already exists: ${path}. No files were changed.`);
  }
  if (options.workers !== undefined && (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 16)) throw new Error('workers must be an integer between 1 and 16');
  const tools = await doctor(options);
  if (!tools.ready) throw new Error(`Rendering tools are not ready. Run machinal-scenes setup, then machinal-scenes doctor.\n${[tools.renderer, tools.browser, tools.ffmpeg].filter(tool => !tool.available).map(tool => tool.error).join('\n')}`);
  const directory = await mkdtemp(join(tmpdir(), 'machinal-scene-render-'));
  try {
    let request;
    if (typeof options.request === 'string') request = resolve(options.request);
    else {
      validateRequest(options.request);
      const audio = options.request.audio?.map(track => ({ ...track, file: resolve(track.file) }));
      request = join(directory, 'request.json');
      await writeFile(request, JSON.stringify({ ...options.request, ...(audio ? { audio } : {}) }), 'utf8');
    }
    await mkdir(dirname(output), { recursive: true });
    const args = ['-request', request, '-serve', resolve(options.serveDirectory ?? 'dist'), '-output', output, '-browser', tools.browser.path, '-ffmpeg', tools.ffmpeg.path, '-workers', String(options.workers ?? 2)];
    if (options.noSandbox) args.push('-no-sandbox');
    if (options.lossless) args.push('-lossless');
    if (options.gpu) args.push('-gpu');
    const result = await runRenderer(tools.renderer.path, args, options.onProgress);
    const asset = parseRenderedSceneAsset(JSON.parse(result));
    const persisted = JSON.parse(await readFile(`${output}.scene.json`, 'utf8'));
    if (asset.sha256 !== persisted.sha256) throw new Error('Native renderer result and output manifest do not match');
    return asset;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runRenderer(executable, args, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-64 * 1024);
      try { onProgress(chunk.toString()); }
      catch (error) { child.kill(); reject(error); }
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Scene rendering failed (${code}):\n${stderr}`)));
  });
}
