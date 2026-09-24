import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  deps: { alwaysBundle: ['@templify/core', '@templify/node-output'], resolveDepSubpath: true },
  outExtensions: () => ({ js: '.js' }),
  dts: false,
  sourcemap: true,
  minify: false,
});
