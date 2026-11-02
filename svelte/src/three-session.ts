import type { FrameContext } from '@direction/scene-runtime';
import { disposeThreeWorld, type SceneThreeAnimation, type SceneThreeContext, type SceneThreeSetup } from './three.js';

type SetupState = { phase: 'pending' } | { phase: 'ready'; animation: SceneThreeAnimation } | { phase: 'disposed' };

export function createThreeSession(setup: SceneThreeSetup, context: SceneThreeContext, onReady: () => void, releaseRenderer: () => void) {
  let state: SetupState = { phase: 'pending' };
  let rendererCleanup: (() => void) | undefined = releaseRenderer;

  function clearWorld() {
    disposeThreeWorld(context.world);
    context.world.clear();
    context.world.background = null;
    context.world.environment = null;
  }

  function dispose() {
    const previous = state;
    state = { phase: 'disposed' };
    try {
      if (previous.phase === 'ready') previous.animation.dispose?.();
    } finally {
      clearWorld();
      const cleanup = rendererCleanup;
      rendererCleanup = undefined;
      cleanup?.();
    }
  }

  const pending = Promise.resolve().then(() => {
    if (state.phase === 'disposed') return;
    context.resources.signal.throwIfAborted();
    return setup(context);
  }).then(value => {
    if (state.phase === 'disposed') {
      try { value?.dispose?.(); } finally { clearWorld(); }
      return;
    }
    if (!value || typeof value.update !== 'function') throw new Error('SceneThree setup must return update(frame)');
    state = { phase: 'ready', animation: value };
    onReady();
  }).catch(error => {
    // Setup can add resources after an earlier unmount, then reject instead of returning them.
    dispose();
    throw error;
  });
  void pending.catch(() => undefined);
  try { context.resources.track(pending); }
  catch (error) { dispose(); throw error; }

  return {
    update(frame: FrameContext): boolean {
      if (state.phase !== 'ready') return false;
      state.animation.update(frame);
      return true;
    },
    dispose,
  };
}
