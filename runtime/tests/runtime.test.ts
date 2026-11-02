import { describe, expect, it } from 'vitest';
import { createResourceScope, mountScene, seededRandom, type FrameContext, type SceneDefinition, type SceneRequest } from '../src/index';

const request: SceneRequest = {
  version: 1, sceneId: 'test', seed: 'fixed', config: { width: 640, height: 360, fps: 30, durationInFrames: 90 },
};

function target(): HTMLElement {
  return { getAnimations: () => [], querySelectorAll: () => [], ownerDocument: { defaultView: null } } as unknown as HTMLElement;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('scene controller', () => {
  it('keeps preview render settings out of the export manifest and restores full-resolution capture', async () => {
    const frames: FrameContext[] = [];
    const scene = mountScene({
      id: 'test', defaults: {},
      create: () => ({ update: frame => { frames.push(frame); }, dispose() {} }),
    }, target(), request, { renderScale: 0.5, capture: false, settle: async () => {} });
    await scene.ready();
    await scene.seek(12, { realtime: true });
    await scene.seek(12, { renderScale: 1, capture: true });
    expect(frames.map(({ renderScale, capture }) => ({ renderScale, capture }))).toEqual([
      { renderScale: 0.5, capture: false }, { renderScale: 0.5, capture: false }, { renderScale: 1, capture: true },
    ]);
    expect(scene.manifest.config).toEqual(request.config);
    expect(scene.manifest).not.toHaveProperty('renderScale');
    await scene.dispose();
  });

  it('updates realtime frames without repeating image/font settling and retains exact seeks for capture', async () => {
    const frames: number[] = [];
    let settled = 0;
    const scene = mountScene({
      id: 'test', defaults: {},
      create: () => ({ update: ({ frame }) => { frames.push(frame); }, dispose() {} }),
    }, target(), request, { settle: async () => { settled++; } });
    await scene.ready();
    await scene.seek(12, { realtime: true });
    await scene.seek(13, { realtime: true });
    expect(settled).toBe(1);
    await scene.seek(12);
    expect(settled).toBe(2);
    expect(frames).toEqual([0, 12, 13, 12]);
    await scene.dispose();
  });

  it('can seek out of order and reproduce the same frame state', async () => {
    const frames: Array<[number, number, number]> = [];
    const scene = mountScene({
      id: 'test', defaults: {},
      create: () => ({ update: (frame) => { frames.push([frame.frame, frame.time, frame.random('orbit')]); }, dispose: () => {} }),
    }, target(), request, { settle: async () => {} });
    await scene.ready();
    await scene.seek(60);
    await scene.seek(12);
    await scene.seek(60);
    expect(frames[1]).toEqual(frames[3]);
    expect(frames[1][1]).toBe(2);
    await scene.dispose();
  });

  it('serializes overlapping seeks within one scene', async () => {
    const held = deferred<void>();
    const events: string[] = [];
    const definition: SceneDefinition = {
      id: 'test', defaults: {},
      create: () => ({
        async update({ frame }) {
          events.push(`start:${frame}`);
          if (frame === 1) await held.promise;
          events.push(`end:${frame}`);
        },
        dispose() {},
      }),
    };
    const scene = mountScene(definition, target(), request, { settle: async () => {} });
    await scene.ready();
    const first = scene.seek(1);
    const second = scene.seek(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).not.toContain('start:2');
    held.resolve();
    await Promise.all([first, second]);
    expect(events.slice(2)).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
    await scene.dispose();
  });

  it('waits for resources registered by the new frame, not only initial loading', async () => {
    const image = deferred<void>();
    let completed = false;
    const scene = mountScene({
      id: 'test', defaults: {},
      create: ({ resources }) => ({
        update: ({ frame }) => { if (frame === 4) resources.track(image.promise); },
        dispose() {},
      }),
    }, target(), request, { settle: async () => {} });
    await scene.ready();
    const seeking = scene.seek(4).then(() => { completed = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).toBe(false);
    image.resolve();
    await seeking;
    expect(completed).toBe(true);
    await scene.dispose();
  });

  it('aborts a stalled frame and disposes the instance exactly once', async () => {
    const stalled = deferred<void>();
    let disposed = 0;
    const scene = mountScene({
      id: 'test', defaults: {},
      create: () => ({ update: ({ frame }) => frame === 8 ? stalled.promise : undefined, dispose: () => { disposed++; } }),
    }, target(), request, { settle: async () => {} });
    await scene.ready();
    const seeking = scene.seek(8);
    const rejection = expect(seeking).rejects.toThrow('Scene disposed');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await scene.dispose();
    await rejection;
    await scene.dispose();
    expect(disposed).toBe(1);
    expect(() => scene.seek(0)).toThrow('Scene disposed');
  });

  it('pauses and seeks CSS animations before completing a frame', async () => {
    const animation = { currentTime: 0, paused: false, pause() { this.paused = true; } };
    const element = target();
    element.getAnimations = () => [animation as unknown as Animation];
    const scene = mountScene({ id: 'test', defaults: {}, create: () => ({ update() {}, dispose() {} }) }, element, request, { settle: async () => {} });
    await scene.seek(45);
    expect(animation.currentTime).toBe(1500);
    expect(animation.paused).toBe(true);
    await scene.dispose();
  });

  it('rejects invalid frames without mutating the scene', async () => {
    const frames: number[] = [];
    const scene = mountScene({ id: 'test', defaults: {}, create: () => ({ update: ({ frame }: FrameContext) => { frames.push(frame); }, dispose() {} }) }, target(), request, { settle: async () => {} });
    await scene.ready();
    for (const frame of [-1, 90, 1.5, NaN]) expect(() => scene.seek(frame)).toThrow('Frame must');
    expect(frames).toEqual([0]);
    await scene.dispose();
  });
});

describe('resource scope', () => {
  it('retains errors from resources that rejected before waiting', async () => {
    const resources = createResourceScope(new AbortController().signal);
    await resources.track(Promise.reject(new Error('Missing image'))).catch(() => {});
    await expect(resources.wait()).rejects.toThrow('Missing image');
  });

  it('stops waiting when its owner is disposed', async () => {
    const controller = new AbortController();
    const resources = createResourceScope(controller.signal);
    resources.track(new Promise(() => {}));
    const waiting = resources.wait();
    controller.abort(new Error('Stopped'));
    await expect(waiting).rejects.toThrow('Stopped');
  });

  it('produces stable named random values independent of call order', () => {
    const first = seededRandom('scene', 'a');
    seededRandom('scene', 'b');
    expect(seededRandom('scene', 'a')).toBe(first);
    expect(seededRandom('other', 'a')).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });
});
