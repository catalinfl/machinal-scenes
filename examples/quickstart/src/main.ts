import { exposeScene } from '@machinal/scenes/runtime';
import { mountSvelteScene } from '@machinal/scenes/svelte';
import Title from './Title.svelte';
import { request } from './request';
const target = document.querySelector<HTMLElement>('#scene')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const slider = document.querySelector<HTMLInputElement>('#frame')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const controller = mountSvelteScene(Title, target, request, {});
const disconnect = exposeScene(controller);
let animation = 0;
let generation = 0;
let frame = 0;
let playing = false;

slider.max = String(request.config.durationInFrames - 1);

function stop() {
  playing = false;
  generation += 1;
  cancelAnimationFrame(animation);
  play.textContent = 'Play';
}

function fail(error: unknown) {
  stop();
  status.textContent = error instanceof Error ? error.message : String(error);
  play.disabled = true;
  slider.disabled = true;
}

function showFrame(next: number) {
  frame = next;
  slider.value = String(next);
  status.textContent = `Frame ${next}`;
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
  const started = performance.now() - frame / request.config.fps * 1000;

  const advance = async (now: number) => {
    if (generation !== active) return;
    const next = Math.min(request.config.durationInFrames - 1, Math.floor((now - started) / 1000 * request.config.fps));
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

slider.addEventListener('input', () => {
  stop();
  const active = generation;
  const next = Number(slider.value);
  void controller.seek(next).then(() => {
    if (generation === active) showFrame(next);
  }).catch(error => {
    if (generation === active) fail(error);
  });
});

window.addEventListener('pagehide', () => {
  stop();
  disconnect();
  void controller.dispose().catch(() => undefined);
}, { once: true });

void controller.ready().then(() => {
  play.disabled = false;
  slider.disabled = false;
  showFrame(0);
}).catch(fail);
