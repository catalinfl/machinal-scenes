import { seededRandom } from './math.js';
import { abortable, createResourceScope, seekCssAnimations, waitForVisualResources } from './resources.js';
import { PROTOCOL_VERSION, type FrameContext, type SceneController, type SceneDefinition, type SceneProps, type SceneRenderOptions, type SceneRequest } from './types.js';
import { validateFrame, validateRequest } from './validation.js';
import { presentSceneVideos, seekSceneVideos } from './media.js';
import { createObjectRegistry } from './objects.js';

export interface MountOptions extends SceneRenderOptions {
  settle?: (target: HTMLElement) => Promise<void>;
}

export function mountScene<P extends SceneProps>(
  definition: SceneDefinition<P>, target: HTMLElement, request: SceneRequest, options: MountOptions = {},
): SceneController {
  validateRequest(request);
  if (request.sceneId !== definition.id) throw new Error(`Unknown scene: ${request.sceneId}`);
  const config = Object.freeze({ ...request.config });
  const props = structuredClone({ ...definition.defaults, ...request.props }) as P;
  const seed = request.seed ?? 'scene-engine';
  const manifest = { version: PROTOCOL_VERSION, sceneId: definition.id, props, seed, config };
  const abort = new AbortController();
  const resources = createResourceScope(abort.signal);
  const objects = createObjectRegistry();
  let currentFrame = frameContext(0, config, seed, options);
  const instance = Promise.resolve().then(() => definition.create({ target, props, config, resources, objects }));
  let queue = Promise.resolve();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  const settle = async (time: number) => {
    await resources.wait();
    await seekSceneVideos(target, time, abort.signal);
    await abortable((options.settle ?? waitForVisualResources)(target), abort.signal);
    await resources.wait();
  };

  const initialReady = instance.then(async (created) => {
    await abortable(Promise.resolve(created.update(currentFrame)), abort.signal);
    seekCssAnimations(target, 0);
    await settle(0);
  });
  void initialReady.catch(() => undefined);

  return {
    version: PROTOCOL_VERSION,
    manifest,
    async ready() {
      assertActive(disposed);
      await initialReady;
    },
    seek(frame, seekOptions) {
      assertActive(disposed);
      validateFrame(frame, config);
      const operation = queue.then(async () => {
        assertActive(disposed);
        await initialReady;
        const created = await instance;
        currentFrame = frameContext(frame, config, seed, { ...options, ...seekOptions });
        await abortable(Promise.resolve(created.update(currentFrame)), abort.signal);
        seekCssAnimations(target, frame / config.fps);
        if (seekOptions?.realtime) {
          presentSceneVideos(target, frame / config.fps, seekOptions.playbackRate ?? 1);
        } else await settle(frame / config.fps);
        assertActive(disposed);
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      abort.abort(new Error('Scene disposed'));
      disposal = queue.then(async () => {
        const created = await instance;
        await created.dispose();
      }).finally(() => objects.clear());
      return disposal;
    },
    snapshotObjects() {
      assertActive(disposed);
      return objects.snapshot(currentFrame);
    },
  };
}

function assertActive(disposed: boolean): void {
  if (disposed) throw new Error('Scene disposed');
}

function frameContext(frame: number, config: FrameContext['config'], seed: string, options: SceneRenderOptions): FrameContext {
  return {
    frame,
    time: frame / config.fps,
    progress: config.durationInFrames === 1 ? 0 : frame / (config.durationInFrames - 1),
    config,
    renderScale: options.renderScale && Number.isFinite(options.renderScale) && options.renderScale > 0 ? Math.min(1, options.renderScale) : 1,
    capture: options.capture ?? true,
    random: (key) => seededRandom(seed, key),
  };
}
