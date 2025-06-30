// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game-night-pwa/',
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
// This configuration sets the base path for the PWA to '/game-night-pwa/'
// and specifies the input file for the build process.