import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererTargets } from '../node/platforms.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const renderer = join(root, 'renderer');
const output = join(root, 'native');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(output, { recursive: true });
const manifest = { version: 1, targets: [] };

for (const target of rendererTargets) {
  const destination = join(output, target.file);
  const temporary = `${destination}.building`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    execFileSync('go', ['build', '-trimpath', '-buildvcs=false', `-ldflags=-s -w -X main.version=${version}`, '-o', temporary, './cmd/scene-render'], {
      cwd: renderer,
      env: { ...process.env, CGO_ENABLED: '0', GOOS: target.goos, GOARCH: target.goarch },
      stdio: 'inherit',
    });
    await rename(temporary, destination);
    await chmod(destination, 0o755);
  } finally {
    await rm(temporary, { force: true });
  }
  const bytes = await readFile(destination);
  manifest.targets.push({ platform: target.platform, arch: target.arch, file: target.file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  console.log(`Built native renderer: ${target.platform}-${target.arch}`);
}

const licenses = [];
const goroot = execFileSync('go', ['env', 'GOROOT'], { cwd: renderer, encoding: 'utf8' }).trim();
licenses.push(`Go standard library\n\n${await readFile(join(goroot, 'LICENSE'), 'utf8')}`);
const modules = new Set(execFileSync('go', ['list', '-deps', '-f', '{{if .Module}}{{if not .Module.Main}}{{.Module.Path}}{{end}}{{end}}', './cmd/scene-render'], { cwd: renderer, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean));
for (const module of [...modules].sort()) {
  const metadata = JSON.parse(execFileSync('go', ['list', '-m', '-json', module], { cwd: renderer, encoding: 'utf8' }));
  const files = (await readdir(metadata.Dir)).filter(name => /^(?:LICENSE|COPYING|NOTICE)(?:\..*)?$/i.test(name));
  if (files.length === 0) throw new Error(`Missing license notice for native dependency ${module}`);
  for (const name of files) licenses.push(`${module} ${metadata.Version} (${name})\n\n${await readFile(join(metadata.Dir, name), 'utf8')}`);
}
await writeFile(join(output, 'THIRD_PARTY_NOTICES.txt'), licenses.join('\n\n--------------------\n\n'), 'utf8');
await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
