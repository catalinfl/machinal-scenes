import * as THREE from 'three';

export interface OrbitPose {
  target?: readonly [number, number, number];
  radius: number;
  azimuth: number;
  elevation: number;
}

/** Assign an absolute camera pose on each frame; angles are radians. */
export function setCameraOrbit(camera: THREE.PerspectiveCamera, { target = [0, 0, 0], radius, azimuth, elevation }: OrbitPose): void {
  if (![...target, radius, azimuth, elevation].every(Number.isFinite) || radius <= 0) throw new Error('Camera orbit needs finite values and a positive radius');
  const horizontal = radius * Math.cos(elevation);
  camera.position.set(target[0] + horizontal * Math.sin(azimuth), target[1] + radius * Math.sin(elevation), target[2] + horizontal * Math.cos(azimuth));
  camera.lookAt(...target);
}

export interface StudioLightOptions {
  intensity?: number;
  keyColor?: THREE.ColorRepresentation;
  rimColor?: THREE.ColorRepresentation;
}

export function createStudioLighting(world: THREE.Scene, { intensity = 1, keyColor = '#fff1db', rimColor = '#91baff' }: StudioLightOptions = {}) {
  if (!Number.isFinite(intensity) || intensity < 0) throw new Error('Lighting intensity must be finite and nonnegative');
  const ambient = new THREE.HemisphereLight('#dce9ff', '#25212b', 0.8 * intensity);
  const key = new THREE.DirectionalLight(keyColor, 3 * intensity);
  const fill = new THREE.DirectionalLight('#d7e8ff', 1.1 * intensity);
  const rim = new THREE.DirectionalLight(rimColor, 2 * intensity);
  key.position.set(4, 5, 6);
  fill.position.set(-4, 1, 3);
  rim.position.set(1, 3, -5);
  world.add(ambient, key, fill, rim);
  return { ambient, key, fill, rim };
}
