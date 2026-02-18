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
      name: 'SquadFeedback',
      formats: ['iife'],
      fileName: () => 'squad-feedback.js'
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
