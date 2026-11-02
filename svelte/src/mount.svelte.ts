import { mount, tick, unmount, type Component } from 'svelte';
import { mountScene, seededRandom, type FrameContext, type MountOptions, type SceneController, type SceneProps, type SceneRequest } from '@direction/scene-runtime';
import { SCENE_CONTEXT, type SvelteSceneContext } from './context.js';

export function mountSvelteScene<P extends SceneProps>(
  component: Component<P>, target: HTMLElement, request: SceneRequest, defaults: P, options?: MountOptions,
): SceneController {
  return mountScene({
    id: request.sceneId,
    defaults,
    async create({ target: element, props, config, resources, objects }) {
      const random: FrameContext['random'] = (key) => seededRandom(request.seed ?? 'scene-engine', key);

      let frame = $state<FrameContext>({
        frame: 0,
        time: 0,
        progress: 0,
        config,
        random,
        renderScale: options?.renderScale ?? 1,
        capture: options?.capture ?? true,
      });

      const context: SvelteSceneContext = {
        get frame() { return frame; },
        resources,
        objects,
        // Saved AI components also use these fields directly on useScene().
        get time() { return frame.time; },
        get progress() { return frame.progress; },
        config,
        random,
      };

      const instance = mount(component, { target: element, props, context: new Map([[SCENE_CONTEXT, context]]) });
      await tick();
      return {
        async update(next) {
          frame = next;
          await tick();
        },
        async dispose() {
          await unmount(instance);
        },
      };
    },
  }, target, request, options);
}
