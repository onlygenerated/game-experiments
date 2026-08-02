import { defineConfig } from 'vitest/config';

/**
 * The calibration probe only. The main vite config excludes tools/ so the
 * probe never runs as part of `npm test` — it has no assertions and is slow.
 */
export default defineConfig({
  test: {
    include: ['tools/**/*.test.ts'],
  },
});
