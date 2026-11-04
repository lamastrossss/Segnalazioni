import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const pages = ['index', 'site', 'install'].filter(p => existsSync(resolve(__dirname, 'board', `${p}.html`)));

export default defineConfig({
  root: 'board',
  envDir: __dirname,
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: Object.fromEntries(pages.map(p => [p, resolve(__dirname, 'board', `${p}.html`)])) },
  },
});
