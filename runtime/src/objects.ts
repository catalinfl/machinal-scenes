import { validateSceneParameters, type SceneObjectParameters, type SceneParameters } from './parameters.js';
import type { FrameContext } from './types.js';

export interface SceneObjectRegistry {
  register(id: string, read: (frame: FrameContext) => SceneObjectParameters): () => void;
  snapshot(frame: FrameContext): SceneParameters;
  clear(): void;
}

export function createObjectRegistry(): SceneObjectRegistry {
  const readers = new Map<string, (frame: FrameContext) => SceneObjectParameters>();
  return {
    register(id, read) {
      validateSceneParameters({ [id]: {} });
      if (readers.has(id) || readers.size >= 32 || typeof read !== 'function') throw new Error('Object readers need unique IDs; at most 32 can be registered');
      readers.set(id, read);
      return () => { if (readers.get(id) === read) readers.delete(id); };
    },
    snapshot(frame) {
      const states: SceneParameters = Object.fromEntries([...readers].map(([id, read]) => {
        const state = read(frame);
        validateSceneParameters({ [id]: state });
        return [id, { ...state }];
      }));
      validateSceneParameters(states);
      return states;
    },
    clear() { readers.clear(); },
  };
}
