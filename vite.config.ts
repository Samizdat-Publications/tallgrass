import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { port: 5199, strictPort: true },
  preview: { port: 5198, strictPort: true },
});
