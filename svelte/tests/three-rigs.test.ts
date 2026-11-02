import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createStudioLighting, setCameraOrbit } from '../src/three-rigs.js';

it('camera rigs assign identical absolute poses after backward seeks', () => {
  const camera = new THREE.PerspectiveCamera();
  const pose = { radius: 5, azimuth: Math.PI / 2, elevation: 0, target: [1, 2, 3] as const };
  setCameraOrbit(camera, pose);
  const expected = camera.matrixWorld.clone();
  expect(camera.position.toArray()[0]).toBeCloseTo(6);
  setCameraOrbit(camera, { radius: 10, azimuth: 0, elevation: 0 });
  setCameraOrbit(camera, pose);
  expect(camera.matrixWorld.equals(expected)).toBe(true);
  expect(() => setCameraOrbit(camera, { radius: 0, azimuth: 0, elevation: 0 })).toThrow();
});

it('studio lighting adds reusable lights without owning a renderer or render loop', () => {
  const world = new THREE.Scene();
  const lights = createStudioLighting(world, { intensity: 2 });
  expect(world.children).toHaveLength(4);
  expect(lights.key.intensity).toBe(6);
  expect(lights.rim.position.z).toBe(-5);
  expect(() => createStudioLighting(world, { intensity: NaN })).toThrow();
});
