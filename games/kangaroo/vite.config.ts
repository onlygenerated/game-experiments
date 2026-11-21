import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `--mode single` builds one chunk, which is what `tools/artifact.mjs` inlines
 * into one offline HTML file.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: mode === 'single' ? { inlineDynamicImports: true } : {},
    },
  },
  test: {
    exclude: ['**/node_modules/**', 'tools/**'],
  },
}));
