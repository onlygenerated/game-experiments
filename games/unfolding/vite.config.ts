import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  base: './',
  build:
    // `--mode sim`: the simulator alone, so it can be folded into one file (npm run single:sim).
    mode === 'sim'
      ? { outDir: 'dist-sim', rollupOptions: { input: resolve(__dirname, 'sim.html') } }
      : // The game, and the branch simulator that runs the same engine without the map.
        { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), sim: resolve(__dirname, 'sim.html') } } },
  test: {
    exclude: ['**/node_modules/**', 'tools/**'],
  },
}));
