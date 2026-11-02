import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const entrypoint = "export * from './runtime/index.js';\nexport * from './svelte/index.js';\n";
const webgpuTypes = '/// <reference types="@webgpu/types" />\n';

// Only this generated distribution directory is replaced; sources stay in their workspaces.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const workspace of ['runtime', 'svelte']) {
  await cp(join(root, workspace, 'dist'), join(output, workspace), { recursive: true });
}

await rewriteImports(join(output, 'svelte'));
await writeFile(join(output, 'index.js'), entrypoint, 'utf8');
await writeFile(join(output, 'index.d.ts'), webgpuTypes + entrypoint, 'utf8');
const svelteTypes = join(output, 'svelte', 'index.d.ts');
await writeFile(svelteTypes, webgpuTypes + await readFile(svelteTypes, 'utf8'), 'utf8');
console.log('Built @machinal/scenes: one distribution, no internal workspace dependencies.');

async function rewriteImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteImports(path);
      continue;
    }
    if (!/\.(?:js|ts|svelte)$/.test(entry.name)) continue;
    const source = await readFile(path, 'utf8');
    const runtimePath = relative(dirname(path), join(output, 'runtime', 'index.js')).split(sep).join('/');
    const rewritten = source.replace(/(['"])@direction\/scene-runtime\1/g, `'${runtimePath}'`);
    if (rewritten.includes('@direction/scene-')) {
      throw new Error(`Unresolved private workspace import in ${path}`);
    }
    await writeFile(path, rewritten, 'utf8');
  }
}
