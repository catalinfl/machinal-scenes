import { mount, unmount } from 'svelte';
import { exposeScene } from '@machinal/scenes/runtime';
import { mountSvelteScene } from '@machinal/scenes/svelte';
import '@fontsource-variable/ibm-plex-sans';
import './workspace.css';
import ExportPanel from './ExportPanel.svelte';
import Title from './Title.svelte';
import { request } from './request';
import { playbackFrame } from './playback';

const target = document.querySelector<HTMLElement>('#scene')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
const slider = document.querySelector<HTMLInputElement>('#frame')!;
const status = document.querySelector<HTMLElement>('#status')!;
const counter = document.querySelector<HTMLOutputElement>('#counter')!;
const panel = mount(ExportPanel, { target: document.querySelector('#export')! });
const controller = mountSvelteScene(Title, target, request, {});
const disconnect = exposeScene(controller);
let animation = 0;
let generation = 0;
let frame = 0;
let playing = false;

slider.max = String(request.config.durationInFrames - 1);
viewport.style.aspectRatio = `${request.config.width} / ${request.config.height}`;
target.style.width = `${request.config.width}px`;
target.style.height = `${request.config.height}px`;
document.querySelector('#dimensions')!.textContent = `${request.config.width} × ${request.config.height} · ${request.config.fps} fps`;

const resize = new ResizeObserver(() => {
  target.style.transform = `scale(${viewport.clientWidth / request.config.width})`;
});

resize.observe(viewport);

function stop() {
  playing = false;
  generation += 1;
  cancelAnimationFrame(animation);
  play.textContent = 'Play';
}

function fail(error: unknown) {
  stop();
  status.textContent = `Preview failed: ${error instanceof Error ? error.message : String(error)}. Check the scene source and reload to retry.`;
  play.disabled = true;
  reset.disabled = true;
  slider.disabled = true;
}

function showFrame(next: number) {
  frame = next;
  slider.value = String(next);
  counter.textContent = `${String(next).padStart(3, '0')} / ${request.config.durationInFrames - 1}`;
}

play.addEventListener('click', () => {
  if (playing) {
    stop();
    return;
  }
  if (frame === request.config.durationInFrames - 1) frame = 0;
  playing = true;
  play.textContent = 'Pause';
  const active = ++generation;
  const startFrame = frame;
  const started = performance.now();

  const advance = async (now: number) => {
    if (generation !== active) return;
    const next = playbackFrame(now, started, startFrame, request.config);
    try {
      await controller.seek(next, { capture: false });
      if (generation !== active) return;
      showFrame(next);
      if (next === request.config.durationInFrames - 1) stop();
      else animation = requestAnimationFrame(now => { void advance(now); });
    } catch (error) {
      if (generation === active) fail(error);
    }
  };
  animation = requestAnimationFrame(now => { void advance(now); });
});

function seek(next: number) {
  stop();
  const active = ++generation;
  void controller.seek(next).then(() => {
    if (generation === active) showFrame(next);
  }).catch(error => {
    if (generation === active) fail(error);
  });
}

slider.addEventListener('input', () => seek(Number(slider.value)));
reset.addEventListener('click', () => seek(0));

window.addEventListener('pagehide', () => {
  stop();
  resize.disconnect();
  disconnect();
  void unmount(panel);
  void controller.dispose().catch(() => undefined);
}, { once: true });

void controller.ready().then(() => {
  play.disabled = false;
  reset.disabled = false;
  slider.disabled = false;
  status.textContent = 'Preview ready. Press Play or scrub to inspect a frame.';
  showFrame(0);
}).catch(fail);
