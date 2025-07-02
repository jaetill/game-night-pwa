import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/game-night-pwa/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),               // <-- this was missing
        'launch-login': resolve(__dirname, 'launch-login.html'),
      },
    },
  },
});

