import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        customElement: true
      }
    })
  ],
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'JatFeedback',
      formats: ['iife'],
      fileName: () => 'jat-feedback.js'
    },
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
