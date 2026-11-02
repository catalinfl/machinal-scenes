import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createResourceScope } from '../../runtime/src/resources.js';
import { createThreeSession } from '../src/three-session.js';
import type { SceneThreeContext, SceneThreeAnimation } from '../src/three.js';
import type { FrameContext } from '../../runtime/src/types.js';

function context(): SceneThreeContext {
  return { THREE, world:new THREE.Scene(), camera:new THREE.PerspectiveCamera(), renderer:{} as THREE.WebGLRenderer,
    resources:createResourceScope(new AbortController().signal) };
}

it('waits for setup, then updates from exact frames and releases renderer only once', async () => {
  const scene = context();
  const background = new THREE.Texture();
  scene.world.background = background;
  const backgroundDispose = vi.spyOn(background, 'dispose');
  const update = vi.fn(), dispose = vi.fn(), ready = vi.fn(), release = vi.fn();
  const session = createThreeSession(async () => ({update,dispose}), scene, ready, release);
  expect(session.update({frame:0} as FrameContext)).toBe(false);
  await scene.resources.wait();
  expect(ready).toHaveBeenCalledOnce();
  session.update({frame:8} as FrameContext);
  expect(update).toHaveBeenLastCalledWith({frame:8});
  session.dispose();session.dispose();
  expect(dispose).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();
  expect(backgroundDispose).toHaveBeenCalledOnce();
});

it.each(['resolve', 'reject'])('cleans resources added after unmount when late setup %s', async outcome => {
  const scene = context();
  const ready = vi.fn(), release = vi.fn(), dispose = vi.fn();
  let finish!: (value:SceneThreeAnimation) => void, fail!: (error:Error) => void;
  const session = createThreeSession(() => new Promise((resolve,reject) => {finish=resolve;fail=reject;}), scene, ready, release);
  await Promise.resolve();
  session.dispose();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  scene.world.add(new THREE.Mesh(geometry,material));
  if (outcome === 'resolve') { finish({update() {},dispose});await scene.resources.wait(); }
  else { fail(new Error('late setup failed'));await expect(scene.resources.wait()).rejects.toThrow('late setup failed'); }
  expect(scene.world.children).toHaveLength(0);
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(ready).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledTimes(outcome === 'resolve' ? 1 : 0);
});

it('releases a session created after cancellation without invoking its setup', async () => {
  const scene = context();
  const abort = new AbortController();
  abort.abort();
  scene.resources = createResourceScope(abort.signal);
  const setup = vi.fn(), release = vi.fn();
  expect(() => createThreeSession(setup,scene,vi.fn(),release)).toThrow();
  await Promise.resolve();
  expect(setup).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();
});
