import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { build } from 'vite';
import { appRoot, electronPath } from './tooling.mjs';

const qaRoot = path.resolve(appRoot, '.desktop/qa');
if (path.relative(appRoot, qaRoot) !== path.join('.desktop', 'qa')) {
  throw new Error('Unexpected UI verification directory.');
}

try {
  await build({
    configFile: false,
    root: appRoot,
    build: {
      target: 'node24',
      outDir: '.desktop/qa',
      emptyOutDir: true,
      lib: { entry: 'tests/ui-smoke.ts', formats: ['es'], fileName: () => 'check.mjs' },
      rolldownOptions: { external: ['electron', /^node:/] },
    },
  });
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electronPath(), [path.join(qaRoot, 'check.mjs')], {
      cwd: appRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
  if (exitCode !== 0) process.exitCode = exitCode ?? 1;
  const result = JSON.parse(await readFile(path.join(qaRoot, 'result.json'), 'utf8'));
  if (!result.passed) throw new Error(result.reason ?? 'UI verification failed.');
} finally {
  await rm(qaRoot, { recursive: true, force: true });
}
