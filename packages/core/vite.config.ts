import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith('node:') ||
        id === 'docxtemplater' ||
        id.startsWith('docxtemplater/') ||
        id === 'filename-reserved-regex' ||
        id === 'lodash' ||
        id === 'pizzip',
    },
    sourcemap: true,
  },
});
