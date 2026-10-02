import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

function electronConfig(name, format, outputFile) {
  return {
    configFile: false,
    root: appRoot,
    cacheDir: `.vite/cache/${name}`,
    build: {
      target: 'node24',
      sourcemap: true,
      minify: false,
      outDir: `.desktop/${name}`,
      emptyOutDir: true,
      lib: {
        entry: `src/${name}/index.ts`,
        formats: [format],
        fileName: () => outputFile,
      },
      rolldownOptions: {
        external: name === 'main' ? ['electron', /^node:/] : ['electron'],
      },
    },
  };
}

export const mainConfig = electronConfig('main', 'es', 'main.mjs');
export const preloadConfig = electronConfig('preload', 'cjs', 'preload.cjs');
