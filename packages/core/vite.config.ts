import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith('node:') ||
        id === '@cantoo/pdf-lib' ||
        id === 'docxtemplater' ||
        id.startsWith('docxtemplater/') ||
        id === 'filename-reserved-regex' ||
        id === 'lodash' ||
        id === 'pizzip' ||
        id === 'reamkit' ||
        id.startsWith('reamkit/'),
    },
    sourcemap: true,
  },
});
