import * as THREE from 'three';
import type { FrameContext, ResourceScope } from '@direction/scene-runtime';

export interface SceneThreeContext {
  THREE: typeof THREE;
  renderer: THREE.WebGLRenderer;
  world: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resources: ResourceScope;
}

export interface SceneThreeAnimation {
  update(frame: FrameContext): void;
  dispose?(): void;
}

export type SceneThreeSetup = (context: SceneThreeContext) => SceneThreeAnimation | Promise<SceneThreeAnimation>;

export function disposeThreeWorld(world: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  world.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  if (world instanceof THREE.Scene) {
    if (world.background instanceof THREE.Texture) textures.add(world.background);
    if (world.environment instanceof THREE.Texture) textures.add(world.environment);
  }
  textures.forEach(texture => {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image);
    texture.dispose();
  });
  images.forEach(image => image.close());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  world.clear();
}
