import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [tailwindcss()],
  base: '/',
  build: {
    // Generate source maps so Sentry can deobfuscate minified stack traces
    // from production events. The maps are uploaded to Sentry during the
    // deploy workflow and then deleted from dist/ before GitHub Pages
    // serves the bundle — Sentry gets readable traces; the public bundle
    // stays minified-only.
    sourcemap: true,
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'index.html'),
        callback: resolve(__dirname, 'callback.html'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true
  }
});
