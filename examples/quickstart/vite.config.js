import { build, defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { doctor, renderVideo, setup } from '@machinal/scenes/node';
import { fileURLToPath } from 'node:url';
import { localExportPlugin } from './tools/local-export.mjs';

export default defineConfig({
  plugins: [svelte(), localExportPlugin({ build, checkTools: doctor, installTools: setup, render: renderVideo })],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        scene: fileURLToPath(new URL('./scene.html', import.meta.url)),
      },
    },
  },
});
