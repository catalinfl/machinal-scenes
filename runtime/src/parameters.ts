export interface SceneObjectParameters {
  x?: number; y?: number; z?: number; rotation?: number;
  scaleX?: number; scaleY?: number; opacity?: number;
  delay?: number; duration?: number; color?: string;
}

export type SceneParameters = Record<string, SceneObjectParameters>;
export type ResolvedSceneObject = Required<SceneObjectParameters>;

const bounds: Record<string, readonly [number, number]> = {
  x: [-19200, 19200], y: [-19200, 19200], z: [-19200, 19200], rotation: [-Math.PI * 100, Math.PI * 100],
  scaleX: [-100, 100], scaleY: [-100, 100], opacity: [0, 1], delay: [0, 60], duration: [0, 60],
};

export function validateSceneParameters(parameters: unknown): asserts parameters is SceneParameters | undefined {
  if (parameters === undefined) return;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('Invalid scene parameters');
  const objects = Object.entries(parameters);
  if (objects.length > 32) throw new Error('Expose at most 32 scene parameter objects');
  for (const [id, object] of objects) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) || !object || typeof object !== 'object' || Array.isArray(object)) throw new Error('Invalid scene parameter object');
    for (const [key, value] of Object.entries(object)) {
      if (key === 'color') {
        if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value)) throw new Error('Scene color must be a six-digit hex color');
      } else {
        const range = Object.hasOwn(bounds, key) ? bounds[key] : undefined;
        if (!range || typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) throw new Error(`Invalid scene parameter: ${key}`);
      }
    }
  }
}

/** Components opt into stable object parameters; arbitrary Svelte is never rewritten. */
export function resolveSceneObject(parameters: SceneParameters, id: string, defaults: SceneObjectParameters = {}): ResolvedSceneObject {
  const override = Object.hasOwn(parameters, id) ? parameters[id] : {};
  const object = { x: 0, y: 0, z: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, delay: 0, duration: 1, color: '#ffffff', ...defaults, ...override };
  validateSceneParameters({ [id]: object });
  return object;
}
