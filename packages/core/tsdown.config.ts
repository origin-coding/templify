import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  deps: { resolveDepSubpath: true },
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true,
  sourcemap: true,
  minify: false,
});
