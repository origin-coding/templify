import { build } from 'vite';

import { mainConfig, preloadConfig } from '../electron.vite.config.mjs';
import { createProcessSupervisor } from './processes.mjs';
import { waitForHttp } from './readiness.mjs';
import {
  appRoot,
  buildWorkspacePackages,
  coreRoot,
  electronPath,
  nuxtCliPath,
  outputRoot,
  tsdownCliPath,
} from './tooling.mjs';

const rendererUrl = 'http://localhost:5173';
const controller = new AbortController();
const firstBuild = { main: Promise.withResolvers(), preload: Promise.withResolvers() };
const built = new Set();
let electron;
let restartTimer;
let restartQueue = Promise.resolve();
let closing = false;
let completed = false;
let failure;

const supervisor = createProcessSupervisor({
  cwd: appRoot,
  log: (name, line) => console.log(`[${name}] ${line}`),
  onFailure: fail,
});

process.once('SIGINT', complete);
process.once('SIGTERM', complete);

try {
  console.log('[dev] Building workspace packages...');
  await buildWorkspacePackages();
  supervisor.start('core', process.execPath, [tsdownCliPath(coreRoot), '--watch'], {
    workingDirectory: coreRoot,
    env: { ...process.env, NODE_ENV: 'development' },
  });
  supervisor.start('node-output', process.execPath, [tsdownCliPath(outputRoot), '--watch'], {
    workingDirectory: outputRoot,
    env: { ...process.env, NODE_ENV: 'development' },
  });
  supervisor.start(
    'renderer',
    process.execPath,
    [nuxtCliPath, 'dev', '--host', 'localhost', '--port', '5173', '--no-fork'],
    {
      env: { ...process.env, NUXT_APP_BASE_URL: '/' },
    },
  );

  const mainWatcher = await build(watchConfig(mainConfig, 'main'));
  const preloadWatcher = await build(watchConfig(preloadConfig, 'preload'));
  try {
    await Promise.race([
      Promise.all([
        firstBuild.main.promise,
        firstBuild.preload.promise,
        waitForHttp(rendererUrl, controller.signal),
      ]),
      rejectOnAbort(controller.signal),
    ]);
    controller.signal.throwIfAborted();
    await restartElectron();
    await rejectOnAbort(controller.signal);
  } finally {
    await Promise.allSettled([mainWatcher.close(), preloadWatcher.close()]);
  }
} catch (error) {
  if (!completed && !failure) failure = error;
} finally {
  closing = true;
  clearTimeout(restartTimer);
  await restartQueue.catch(() => {});
  await supervisor.shutdown();
  if (failure) {
    console.error('[dev]', failure);
    process.exitCode = 1;
  }
}

function watchConfig(config, name) {
  return {
    ...config,
    plugins: [{ name: `templify-${name}-ready`, writeBundle: () => builtSuccessfully(name) }],
    build: { ...config.build, watch: {} },
  };
}

function builtSuccessfully(name) {
  if (!built.has(name)) {
    built.add(name);
    firstBuild[name].resolve();
    return;
  }
  if (electron && !closing) scheduleRestart();
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartQueue = restartQueue.then(restartElectron).catch(fail);
  }, 300);
}

async function restartElectron() {
  if (closing || controller.signal.aborted) return;
  if (electron) await supervisor.stop(electron);
  if (closing || controller.signal.aborted) return;
  electron = supervisor.start('electron', electronPath(), ['.'], {
    required: false,
    env: { ...process.env, TEMPLIFY_RENDERER_URL: rendererUrl },
  });
  const active = electron;
  void active.closed.then((result) => {
    if (electron === active && !active.expectedExit && !closing) {
      if (result.code === 0) complete();
      else fail(new Error(`Electron exited with ${result.signal ?? `code ${result.code}`}`));
    }
  });
}

function complete() {
  if (controller.signal.aborted) return;
  completed = true;
  closing = true;
  controller.abort();
}

function fail(error) {
  if (controller.signal.aborted) return;
  failure = error;
  controller.abort(error);
}

function rejectOnAbort(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}
