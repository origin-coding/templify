import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const workspaceRoot = path.resolve(appRoot, '../..');

const desktopRequire = createRequire(import.meta.url);

export function electronPath() {
  return desktopRequire('electron');
}
export const nuxtCliPath = path.join(
  path.dirname(desktopRequire.resolve('nuxt/package.json')),
  'bin',
  'nuxt.mjs',
);

export const coreRoot = path.join(workspaceRoot, 'packages/core');
export const outputRoot = path.join(workspaceRoot, 'packages/node-output');

export function tsdownCliPath(packageRoot) {
  const packageRequire = createRequire(path.join(packageRoot, 'package.json'));
  return path.join(path.dirname(packageRequire.resolve('tsdown/package.json')), 'dist', 'run.mjs');
}

export function runNode(script, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: options.cwd ?? appRoot,
      env: options.env ?? process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(script)} exited with ${signal ?? `code ${code}`}`));
    });
  });
}

export async function buildWorkspacePackages() {
  await runNode(tsdownCliPath(coreRoot), [], { cwd: coreRoot });
  await runNode(tsdownCliPath(outputRoot), [], { cwd: outputRoot });
}
