import { expect, it } from 'vitest';
import { resolveSceneObject, validateSceneParameters } from '../src/parameters.js';

it('resolves explicit object parameters without mutating defaults or inventing edits to Svelte', () => {
  const defaults = { x: 10, y: 20, opacity: 1 };
  const parameters = { receiver: { x: 100, color: '#ff9900' } };
  const object = resolveSceneObject(parameters, 'receiver', defaults);
  expect(object).toMatchObject({ x: 100, y: 20, color: '#ff9900', opacity: 1, scaleX: 1 });
  expect(defaults.x).toBe(10);
  expect(resolveSceneObject(parameters, 'constructor').x).toBe(0);
});

it('rejects nulls, unrecognized keys, unsafe colors and out-of-range values', () => {
  for (const value of [null, [], { actor: null }, { actor: { opacity: 2 } }, { actor: { x: Infinity } }, { actor: { color: 'url(x)' } }, { actor: { constructor: 1 } }, { '../file': {} }]) expect(() => validateSceneParameters(value)).toThrow();
  expect(() => validateSceneParameters({ actor: { x: 0, opacity: 0, delay: 0, duration: 0, color: '#000000' } })).not.toThrow();
});
