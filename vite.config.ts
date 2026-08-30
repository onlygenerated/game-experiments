import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Two pages out of one source tree: the card prototype and Kangaroo, which are
 * unrelated tools that only share a repo.
 *
 * `--mode kangaroo` builds Kangaroo alone, as a single chunk, which is what
 * `tools/kangaroo-artifact.mjs` inlines into one offline HTML file. The default
 * build emits both pages normally.
 */
export default defineConfig(({ mode }) => {
  const solo = mode === 'kangaroo';
  const input: Record<string, string> = solo
    ? { kangaroo: 'kangaroo.html' }
    : { main: 'index.html', kangaroo: 'kangaroo.html' };
  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: solo ? 'dist-kangaroo' : 'dist',
      rollupOptions: {
        // Paths are relative to the Vite root, which avoids needing
        // `__dirname` in what is an ES module with no `@types/node` here.
        input,
        output: solo ? { inlineDynamicImports: true } : {},
      },
    },
    test: {
      // tools/ holds the calibration probe, which has no assertions and is slow.
      // Run it deliberately with `npm run probe`, not as part of `npm test`.
      exclude: ['**/node_modules/**', 'tools/**'],
    },
  };
});
