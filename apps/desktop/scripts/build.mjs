import { build } from 'vite';

import { mainConfig, preloadConfig } from '../electron.vite.config.mjs';
import { buildWorkspacePackages, nuxtCliPath, runNode } from './tooling.mjs';

await buildWorkspacePackages();
await build(mainConfig);
await build(preloadConfig);
await runNode(nuxtCliPath, ['generate'], {
  env: { ...process.env, NUXT_APP_BASE_URL: './' },
});
