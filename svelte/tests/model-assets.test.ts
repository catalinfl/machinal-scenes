import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createResourceScope } from '../../runtime/src/resources.js';
import { modelFixture } from '../../tests/fixtures/model-fixture.mjs';
import { imageDataURL } from '../../tests/fixtures/image-fixture.mjs';
import { loadSceneModel, loadSceneTexture } from '../src/model-assets.js';
import { disposeThreeWorld } from '../src/three.js';

afterEach(() => vi.restoreAllMocks());

it('tracks texture readiness, marks color space and rejects external or oversized inputs before a loader runs', async () => {
  const scope = createResourceScope(new AbortController().signal);
  const texture = new THREE.Texture();
  const load = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture);
  expect(await loadSceneTexture(imageDataURL, scope)).toBe(texture);
  await scope.wait();
  expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(() => loadSceneTexture('https://example.invalid/texture.png', scope)).toThrow();
  expect(() => loadSceneTexture('data:image/png;base64,' + 'A'.repeat(7_000_000), scope)).toThrow();
  expect(load).toHaveBeenCalledTimes(1);
});

it('disposes texture and model resources that finish after cancellation', async () => {
  const abort = new AbortController();
  const scope = createResourceScope(abort.signal);
  const texture = new THREE.Texture();
  const textureDispose = vi.spyOn(texture, 'dispose');
  let finishTexture!: (value: THREE.Texture) => void;
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(() => new Promise(resolve => { finishTexture = resolve; }));
  const textureLoad = loadSceneTexture(imageDataURL, scope);
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  group.add(new THREE.Mesh(geometry, material));
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  let finishModel!: (value: any) => void;
  vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(() => new Promise(resolve => { finishModel = resolve; }));
  const modelLoad = loadSceneModel(modelFixture().source, scope);
  abort.abort();
  finishTexture(texture);
  finishModel({scene:group,scenes:[group]});
  await expect(textureLoad).rejects.toMatchObject({name:'AbortError'});
  await expect(modelLoad).rejects.toMatchObject({name:'AbortError'});
  expect(textureDispose).toHaveBeenCalledOnce();
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(materialDispose).toHaveBeenCalledOnce();
});

it('deduplicates shared world resources and closes shared image bitmaps', () => {
  class TestBitmap { close = vi.fn(); }
  vi.stubGlobal('ImageBitmap', TestBitmap);
  try {
    const image = new TestBitmap();
    const map = new THREE.Texture(image);
    const second = new THREE.Texture(image);
    const material = new THREE.MeshBasicMaterial({map});
    const geometry = new THREE.BoxGeometry();
    const world = new THREE.Scene();
    world.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    world.background = second;
    const dispose = vi.spyOn(map, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    disposeThreeWorld(world);
    expect(dispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(image.close).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
