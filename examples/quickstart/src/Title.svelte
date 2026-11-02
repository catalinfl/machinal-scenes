<script lang="ts">
  import { SceneCanvas, interpolate, useScene } from '@machinal/scenes';

  let { title = 'Make a scene.' }: { title?: string } = $props();
  const scene = useScene();
  const x = $derived(interpolate(scene.frame.frame, [0, 60], [0, scene.frame.config.width / 4]));
</script>

<SceneCanvas background="#f5f2eb">
  <div class="subject" data-scene-object="title" style:transform="translateX({x}px)" style:font-size="{scene.frame.config.width / 16}px">
    <span class="marker"></span>
    <h2>{title}</h2>
    <p>Frame {scene.frame.frame} / {scene.frame.config.durationInFrames - 1}</p>
  </div>
</SceneCanvas>

<style>
  .subject { position:absolute; left:6.25%; top:30%; color:#262a30; font-family:system-ui,sans-serif; }
  .marker { display:block; width:0.7em; height:0.7em; background:#7047c7; }
  h2 { margin:0.4em 0 0.2em; font-size:1em; }
  p { margin:0; font-size:0.4em; font-variant-numeric:tabular-nums; }
</style>
