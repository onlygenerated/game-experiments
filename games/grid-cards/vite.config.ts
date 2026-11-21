import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    // tools/ holds the calibration probe, which has no assertions and is slow.
    // Run it deliberately with `npm run probe`, not as part of `npm test`.
    exclude: ['**/node_modules/**', 'tools/**'],
  },
});
