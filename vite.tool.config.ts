import { defineConfig } from 'vite';

export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: { entry: 'src/tool/main.ts', formats: ['iife'], name: 'StageReview', fileName: () => 'tool.js' },
  },
});
