import { getContext } from 'svelte';
import type { FrameContext, ResourceScope, SceneObjectRegistry } from '@direction/scene-runtime';

export const SCENE_CONTEXT = Symbol('direction.scene');

export interface SvelteSceneContext {
  readonly frame: FrameContext;
  readonly resources: ResourceScope;
  readonly objects: SceneObjectRegistry;
  readonly time: FrameContext['time'];
  readonly progress: FrameContext['progress'];
  readonly config: FrameContext['config'];
  readonly random: FrameContext['random'];
}

export function useScene(): SvelteSceneContext {
  const scene = getContext<SvelteSceneContext>(SCENE_CONTEXT);
  if (!scene) throw new Error('useScene() must be used inside a mounted scene');
  return scene;
}
