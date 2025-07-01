import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/game-night-pwa/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
    },
  },
});
