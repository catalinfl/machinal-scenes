import type { ResourceScope } from './types.js';

export function createResourceScope(signal: AbortSignal): ResourceScope {
  const pending = new Set<Promise<unknown>>();
  let failure: unknown;
  let failed = false;

  return {
    signal,
    track<T>(resource: Promise<T>): Promise<T> {
      signal.throwIfAborted();
      const tracked = resource.then(
        (value) => { pending.delete(tracked); return value; },
        (error: unknown) => { pending.delete(tracked); failed = true; failure = error; throw error; },
      );
      pending.add(tracked);
      // A tracked resource may finish before ready()/seek() starts awaiting it.
      void tracked.catch(() => undefined);
      return tracked;
    },
    async wait(): Promise<void> {
      signal.throwIfAborted();
      while (pending.size > 0) {
        await abortable(Promise.all([...pending]), signal);
        signal.throwIfAborted();
      }
      if (failed) throw failure;
    },
  };
}

export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

type ImageSource = Pick<HTMLImageElement, 'currentSrc' | 'src' | 'srcset' | 'sizes'>;
const decodedImages = new WeakMap<HTMLImageElement, ImageSource>();

async function waitForImage(image: HTMLImageElement): Promise<void> {
  if (!image.currentSrc && !image.src) return;
  const source = { currentSrc: image.currentSrc, src: image.src, srcset: image.srcset, sizes: image.sizes };
  const cached = decodedImages.get(image);
  if (image.complete && image.naturalWidth > 0 && cached?.currentSrc === source.currentSrc
    && cached.src === source.src && cached.srcset === source.srcset && cached.sizes === source.sizes) return;
  // decode() can wait for a compositor tick even for an unchanged image.
  // Retain only successful decodes; source changes and failures must still wait.
  await image.decode();
  decodedImages.set(image, source);
}

export async function waitForVisualResources(target: HTMLElement): Promise<void> {
  // Font requests can start only after layout. Awaiting fonts.ready before
  // discovering the used faces can capture fallback metrics on a fresh worker.
  target.getBoundingClientRect();
  if (target.ownerDocument.fonts) {
    await Promise.all([...target.ownerDocument.fonts].map(face => face.status === 'loaded' ? undefined : face.load()));
  }
  await target.ownerDocument.fonts?.ready;
  await Promise.all([...target.querySelectorAll('img')].map(waitForImage));
}

export function seekCssAnimations(target: HTMLElement, time: number): void {
  for (const animation of target.getAnimations({ subtree: true })) {
    animation.pause();
    animation.currentTime = time * 1000;
  }
}
