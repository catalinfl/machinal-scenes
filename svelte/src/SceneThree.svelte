<script lang="ts">
  import * as THREE from 'three';
  import { untrack } from 'svelte';
  import { useScene } from './context.js';
  import type { SceneThreeSetup } from './three.js';
  import { createThreeSession } from './three-session.js';

  let { setup, width, height, label = '3D scene' }: { setup: SceneThreeSetup; width?: number; height?: number; label?: string } = $props();
  const scene = useScene();
  let canvas = $state<HTMLCanvasElement>();
  const size = $derived({ width: width ?? scene.frame.config.width, height: height ?? scene.frame.config.height });
  let renderFrame: (() => void) | undefined;

  $effect(() => {
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 5;
    let renderWidth = 0;
    let renderHeight = 0;
    renderFrame = () => {
      const scale = scene.frame.renderScale ?? 1;
      if (renderer.getPixelRatio() !== scale) renderer.setPixelRatio(scale);
      if (renderWidth !== size.width || renderHeight !== size.height) {
        renderer.setSize(size.width, size.height, false);
        renderWidth = size.width;
        renderHeight = size.height;
      }
      camera.aspect = size.width / size.height;
      if (!session.update(scene.frame)) return;
      camera.updateProjectionMatrix();
      renderer.render(world, camera);
      // Capture needs a completed GPU frame; ordinary playback must not block on it.
      if (scene.frame.capture !== false) renderer.getContext().finish();
    };
    const session = createThreeSession(context => untrack(() => setup(context)),
      { THREE, renderer, world, camera, resources: scene.resources }, () => renderFrame?.(), () => {
        renderer.dispose();
        renderer.forceContextLoss();
      });
    return () => {
      renderFrame = undefined;
      session.dispose();
    };
  });

  $effect(() => {
    scene.frame;
    size;
    renderFrame?.();
  });
</script>

<canvas bind:this={canvas} aria-label={label} style:width="{size.width}px" style:height="{size.height}px"></canvas>

<style>
  canvas { display:block; }
</style>
