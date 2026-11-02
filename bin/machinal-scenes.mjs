#!/usr/bin/env node
import { cp, mkdir, readFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { doctor, renderVideo, setup } from '../node/index.mjs';
import { formatRenderResult, formatToolchainStatus } from '../node/cli-output.mjs';

const help = `@machinal/scenes

Usage:
  machinal-scenes init <directory>  Create a standalone Svelte/Vite scene project
  machinal-scenes setup             Install pinned Chromium and FFmpeg once
  machinal-scenes doctor            Check the packaged renderer and local tools
  machinal-scenes render            Render scene.config.json + dist/ to scene.mp4
  machinal-scenes --version        Print the installed version
  machinal-scenes --help           Show this help

Render options:
  --request <file>   JSON/YAML request (default: scene.config.json)
  --serve <dir>      Built scene directory (default: dist)
  --output <file>    New MP4/WebM filename (default: scene.mp4)
  --workers <1-16>   Frame-capture workers (default: 2)
  --lossless        Lossless intermediate encoding
  --gpu             Enable hardware GPU rendering
  --no-sandbox      Explicitly disable Chromium sandbox (isolated containers only)

Setup/doctor/render options:
  --json            Print complete metadata instead of a readable summary
  --browser <file>   Use an existing Chrome/Chromium executable
  --ffmpeg <file>    Use an existing FFmpeg executable
  --cache-dir <dir>  Override the native-tool cache

Only setup downloads tools. Rendering is local and requires no Go installation,
Machinal account, API key or private service. Existing output files are never replaced.
`;

async function run(args) {
  if (args.length === 0 || args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(help);
    return;
  }
  if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(manifest.version);
    return;
  }
  if (['setup', 'doctor', 'render'].includes(args[0])) {
    await runTools(args[0], args.slice(1));
    return;
  }
  if (args.length !== 2 || args[0] !== 'init' || !args[1].trim() || args[1].startsWith('-')) throw new Error(`Expected a supported command.\n\n${help}`);

  const destination = resolve(args[1]);
  try {
    await mkdir(destination);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Destination already exists: ${destination}. No files were changed.`);
    throw error;
  }
  await cp(fileURLToPath(new URL('../examples/quickstart/', import.meta.url)), destination, {
    recursive: true, errorOnExist: true, force: false,
  });
  await rename(join(destination, 'gitignore'), join(destination, '.gitignore'));
  console.log(`Created ${destination}\n\nOpen this directory, then run:\n  npm install\n  npm run dev\n\nIn the browser, use Download rendering tools (once), Render MP4, then Download MP4.\n\nTerminal alternative:\n  npm run setup\n  npm run render`);
}

async function runTools(command, args) {
  const common = { help: { type: 'boolean' }, json: { type: 'boolean' }, browser: { type: 'string' }, ffmpeg: { type: 'string' }, 'cache-dir': { type: 'string' } };
  const rendering = { request: { type: 'string' }, serve: { type: 'string' }, output: { type: 'string' }, workers: { type: 'string' }, lossless: { type: 'boolean' }, gpu: { type: 'boolean' }, 'no-sandbox': { type: 'boolean' } };
  const { values } = parseArgs({ args, options: { ...common, ...(command === 'render' ? rendering : {}) }, strict: true, allowPositionals: false });
  if (values.help) { console.log(help); return; }
  const options = { browserExecutable: values.browser, ffmpegExecutable: values.ffmpeg, cacheDirectory: values['cache-dir'] };
  if (command === 'render') {
    const result = await renderVideo({ ...options, request: values.request ?? 'scene.config.json', serveDirectory: values.serve ?? 'dist', output: values.output ?? 'scene.mp4', workers: values.workers === undefined ? undefined : Number(values.workers), lossless: values.lossless, gpu: values.gpu, noSandbox: values['no-sandbox'], onProgress: message => process.stderr.write(message) });
    console.log(values.json ? JSON.stringify(result, null, 2) : formatRenderResult(result));
    return;
  }
  const result = command === 'setup' ? await setup({ ...options, onProgress: message => console.error(message) }) : await doctor(options);
  console.log(values.json ? JSON.stringify(result, null, 2) : formatToolchainStatus(result));
  if (!result.ready) process.exitCode = 1;
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
