import { defineConfig } from 'vitest/config';

/**
 * The calibration probe only. The main vite config excludes tools/ so the
 * probe never runs as part of `npm test` — it has no assertions and is slow.
 */
export default defineConfig({
  test: {
    include: ['tools/**/*.test.ts'],
    // A full sweep is ~31s for 24 rulesets and grows with every variant added,
    // so vitest's 5s default would fail the probe rather than report it.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
