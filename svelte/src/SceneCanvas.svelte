<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useScene } from './context.js';

  let { children, background = 'transparent' }: { children: Snippet; background?: string } = $props();
  const scene = useScene();
</script>

<div style:width="{scene.frame.config.width}px" style:height="{scene.frame.config.height}px" style:background={scene.frame.config.transparent ? 'transparent' : background}>
  {@render children()}
</div>

<style>
  div { position: relative; overflow: hidden; }
</style>
