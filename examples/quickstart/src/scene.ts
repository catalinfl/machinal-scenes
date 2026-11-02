import { exposeScene } from '@machinal/scenes/runtime';
import { mountSvelteScene } from '@machinal/scenes/svelte';
import Title from './Title.svelte';
import { request } from './request';

const controller = mountSvelteScene(Title, document.getElementById('scene')!, request, {});
const disconnect = exposeScene(controller);
void controller.ready().catch(error => { window.__sceneError = error.message; });
window.addEventListener('pagehide', () => {
  disconnect();
  void controller.dispose().catch(() => undefined);
}, { once: true });
