<script lang="ts">
  import { clamp, resolveVideoEffects, videoFilter, videoTime, type VideoEffects, type VideoLook } from '@direction/scene-runtime';
  import { useScene } from './context.js';

  let {
    src, width, height, start = 0, end, offset = 0, playbackRate = 1, loop = false,
    fit = 'contain', look = 'original', effects = {}, label = 'Scene video',
  }: {
    src: string; width?: number; height?: number; start?: number; end?: number; offset?: number;
    playbackRate?: number; loop?: boolean; fit?: 'contain' | 'cover' | 'fill';
    look?: VideoLook; effects?: VideoEffects; label?: string;
  } = $props();

  const scene = useScene();
  let duration = $state(0);
  const treatment = $derived(resolveVideoEffects(look, effects));
  const time = $derived(videoTime(scene.frame.time, duration, { start, end, offset, playbackRate, loop }));
  const advancing = $derived(scene.frame.time >= offset && (loop || time < Math.min(end ?? duration, duration) - 0.000002));
</script>

<div class="surface" style:width="{width ?? scene.frame.config.width}px" style:height="{height ?? scene.frame.config.height}px">
  <!-- Scene media is silent; captions and narration are authored separately. -->
  <!-- svelte-ignore a11y_media_has_caption -->
  <video {src} muted playsinline preload="auto" aria-label={label} data-scene-video-time={time}
    data-scene-video-rate={advancing ? playbackRate : 0}
    onloadedmetadata={(event) => duration = event.currentTarget.duration}
    style:object-fit={fit} style:filter={videoFilter(treatment)}></video>
  {#if treatment.vignette}<div class="vignette" style:opacity={clamp(treatment.vignette)}></div>{/if}
  {#if treatment.scanlines}<div class="scanlines" style:opacity={clamp(treatment.scanlines)}></div>{/if}
</div>

<style>
  .surface { position:relative; overflow:hidden; }
  video { display:block; width:100%; height:100%; }
  .vignette, .scanlines { position:absolute; inset:0; pointer-events:none; }
  .vignette { background:radial-gradient(ellipse at center, transparent 35%, #000 100%); }
  .scanlines { background:repeating-linear-gradient(to bottom, transparent 0 2px, #000 2px 3px); }
</style>
