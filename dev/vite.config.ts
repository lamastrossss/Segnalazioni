import { defineConfig } from 'vite';
export default defineConfig({ root: import.meta.dirname, envDir: `${import.meta.dirname}/..`, server: { port: 5199, strictPort: true } });
