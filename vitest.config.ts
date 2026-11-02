import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['runtime/tests/**/*.test.ts', 'svelte/tests/**/*.test.ts', 'tests/quickstart-playback.test.ts'], environment: 'node' },
});
