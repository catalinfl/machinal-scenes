import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { decodeModelData, pngDimensions, validateGLB, type ResourceScope } from '@direction/scene-runtime';
import { disposeThreeWorld } from './three.js';

export function loadSceneModel(source: string, resources: ResourceScope): Promise<THREE.Group> {
  resources.signal.throwIfAborted();
  const bytes = decodeModelData(source);
  validateGLB(bytes);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:')) throw new Error('GLB loader only accepts internally embedded blob resources');
    return url;
  });
  const loader = new GLTFLoader(manager);
  const loading = loader.parseAsync(bytes.buffer as ArrayBuffer, '').then(result => {
    if (resources.signal.aborted) {
      disposeThreeWorld(result.scene);
      resources.signal.throwIfAborted();
    }
    return result.scene;
  });
  return resources.track(loading);
}

export function loadSceneTexture(source: string, resources: ResourceScope): Promise<THREE.Texture> {
  resources.signal.throwIfAborted();
  const prefix = 'data:image/png;base64,';
  if (typeof source !== 'string' || !source.startsWith(prefix) || source.length > prefix.length + Math.ceil(5 * 1024 * 1024 / 3) * 4) throw new Error('Use an approved embedded PNG texture of at most 5 MiB');
  const decoded = atob(source.slice(prefix.length));
  if (decoded.length > 5 * 1024 * 1024) throw new Error('PNG texture exceeds its byte limit');
  pngDimensions(Uint8Array.from(decoded, character => character.charCodeAt(0)));
  return resources.track(new THREE.TextureLoader().loadAsync(source).then(texture => {
    if (resources.signal.aborted) {
      texture.dispose();
      resources.signal.throwIfAborted();
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }));
}
