<script lang="ts">
  import { SceneCanvas, interpolate, useScene } from '@machinal/scenes';

  let { title = 'Make a scene.' }: { title?: string } = $props();
  const scene = useScene();
  const x = $derived(interpolate(scene.frame.frame, [0, 60], [0, 160]));
</script>

<SceneCanvas background="#f5f2eb">
  <div class="subject" data-scene-object="title" style:transform="translateX({x}px)">
    <span class="marker"></span>
    <h2>{title}</h2>
    <p>Frame {scene.frame.frame} / {scene.frame.config.durationInFrames - 1}</p>
  </div>
</SceneCanvas>

<style>
  .subject { position:absolute; left:40px; top:110px; color:#262a30; font-family:system-ui,sans-serif; }
  .marker { display:block; width:28px; height:28px; background:#7047c7; }
  h2 { margin:16px 0 8px; font-size:40px; }
  p { margin:0; font-variant-numeric:tabular-nums; }
</style>
