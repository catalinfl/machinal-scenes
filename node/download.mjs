import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { constants, copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function downloadVerified(url, destination, expectedHash, fetchFile = fetch) {
  if (new URL(url).protocol !== 'https:') throw new Error('Tool downloads require HTTPS');
  const response = await fetchFile(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body) throw new Error(`Tool download failed: HTTP ${response.status}`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.partial-${randomUUID()}`;
  const hash = createHash('sha256');
  let received = 0;
  const meter = new Transform({
    transform(chunk, encoding, next) {
      received += chunk.length;
      if (received > 128 * 1024 * 1024) return next(new Error('Tool download exceeds the 128 MiB limit'));
      hash.update(chunk);
      next(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temporary, { flags: 'wx' }));
    if (hash.digest('hex') !== expectedHash) throw new Error('Tool download SHA-256 mismatch; no executable was installed');
    await copyFile(temporary, destination, constants.COPYFILE_EXCL);
  } finally {
    await rm(temporary, { force: true });
  }
}
