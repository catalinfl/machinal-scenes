import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const prefix = '/__machinal/export/';
const busyPhases = new Set(['installing', 'building', 'rendering']);

export function localExportPlugin({ build, checkTools, installTools, render }) {
  return {
    name: 'machinal-local-export',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      let tools;
      let inspection;
      let job = { phase: 'idle' };
      let output;

      async function inspect() {
        inspection ??= checkTools().then(result => { tools = result; }).finally(() => { inspection = undefined; });
        await inspection;
      }

      function progress(message) {
        job = { ...job, message: String(message).trim().split(/\r?\n/).at(-1).slice(-1200) };
      }

      async function run(action) {
        try {
          if (action === 'setup') {
            tools = await installTools({ onProgress: progress });
            job = { phase: 'idle' };
          } else {
            await exportVideo();
          }
        } catch (error) {
          job = { phase: 'error', message: (error instanceof Error ? error.message : String(error)).slice(-4000) };
        }
      }

      async function exportVideo() {
        const temporary = await mkdtemp(join(tmpdir(), 'machinal-preview-'));
        try {
          const request = JSON.parse(await readFile(join(root, 'scene.config.json'), 'utf8'));
          const audio = request.audio?.map(track => ({ ...track, file: resolve(root, track.file) }));
          const filename = `scene-${randomUUID()}.mp4`;
          await build({ root, configFile: server.config.configFile, logLevel: 'warn', build: { outDir: temporary, emptyOutDir: true } });
          await mkdir(join(root, 'renders'), { recursive: true });
          const destination = join(root, 'renders', filename);
          job = { phase: 'rendering', message: 'Capturing frames and encoding MP4…' };
          await render({ request: { ...request, ...(audio ? { audio } : {}) }, serveDirectory: temporary, output: destination, onProgress: progress });
          output = destination;
          job = { phase: 'done', filename, download: `${prefix}video`, localFile: destination };
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
      }

      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(prefix)) return next();
        void handle(request, response).catch(error => {
          if (response.headersSent) response.destroy(error);
          else json(response, 500, { error: error instanceof Error ? error.message : String(error) });
        });
      });

      async function handle(request, response) {
        const host = request.headers.host;
        const port = server.httpServer?.address()?.port;
        const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
        if (!allowedHosts.includes(host) || request.headers.origin && request.headers.origin !== `http://${host}` || request.headers['sec-fetch-site'] === 'cross-site') {
          return json(response, 403, { error: 'Local export only accepts same-origin requests on the loopback address.' });
        }
        const action = request.url.slice(prefix.length);
        if (action === 'video' && request.method === 'GET') return download(response);
        if (action === 'status' && request.method === 'GET') {
          if (!tools) await inspect();
          return json(response, 200, { tools, job });
        }
        if (!['setup', 'render'].includes(action)) return json(response, 404, { error: 'Unknown local export action.' });
        if (request.method !== 'POST') return json(response, 405, { error: 'Use POST to start a local export action.' });
        if (request.headers['x-machinal-export'] !== '1') return json(response, 403, { error: 'Missing local export request header.' });
        if (busyPhases.has(job.phase)) return json(response, 409, { error: 'A local operation is already running. Wait for it to finish.' });
        if (!tools) await inspect();
        if (busyPhases.has(job.phase)) return json(response, 409, { error: 'A local operation is already running. Wait for it to finish.' });
        if (action === 'render' && !tools.ready) return json(response, 409, { error: 'Download rendering tools before rendering. Use the button above or npm run setup.' });
        job = action === 'setup'
          ? { phase: 'installing', message: 'Downloading Chrome Headless Shell and FFmpeg…' }
          : { phase: 'building', message: 'Building the current scene source…' };
        json(response, 202, { tools, job });
        void run(action);
      }

      async function download(response) {
        if (job.phase !== 'done' || !output) return json(response, 404, { error: 'No completed video. Render your scene first.' });
        const filename = job.filename;
        const destination = output;
        const file = await stat(destination);
        response.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': file.size,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        const stream = createReadStream(destination);
        stream.once('error', error => response.destroy(error));
        response.once('close', () => stream.destroy());
        stream.pipe(response);
      }
    },
  };
}

function json(response, code, value) {
  response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}
