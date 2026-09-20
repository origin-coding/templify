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
        id === 'docxtemplater' ||
        id.startsWith('docxtemplater/') ||
        id === 'lodash' ||
        id === 'pizzip',
    },
    sourcemap: true,
  },
});
