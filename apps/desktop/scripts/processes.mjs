import { spawn } from 'node:child_process';

export function createProcessSupervisor({ cwd, log, onFailure }) {
  const children = new Set();
  let stopping = false;

  function start(
    name,
    command,
    args,
    { env = process.env, required = true, workingDirectory = cwd } = {},
  ) {
    const child = spawn(command, args, {
      cwd: workingDirectory,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: name !== 'electron',
      detached: process.platform !== 'win32',
    });
    const record = { child, name, expectedExit: false, closed: undefined };
    record.closed = new Promise((resolve) => {
      child.once('close', (code, signal) => {
        children.delete(record);
        resolve({ code, signal });
        if (!record.expectedExit && !stopping && required)
          onFailure(new Error(`${name} exited with ${signal ?? `code ${code}`}`));
      });
    });
    child.once('error', (error) => {
      if (!stopping) onFailure(new Error(`${name} failed to start: ${error.message}`));
    });
    children.add(record);
    pipeOutput(name, child.stdout, log);
    pipeOutput(name, child.stderr, log);
    return record;
  }

  async function stop(record) {
    if (!record || record.expectedExit) return;
    record.expectedExit = true;
    const pid = record.child.pid;
    if (!pid) return;
    if (process.platform === 'win32') {
      await new Promise((resolve, reject) => {
        const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        killer.once('error', reject);
        killer.once('close', resolve);
      });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await record.closed;
  }

  async function shutdown() {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled([...children].map(stop));
  }

  return { start, stop, shutdown };
}

function pipeOutput(name, stream, log) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (pending + chunk).split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) if (line) log(name, line);
  });
  stream.on('end', () => {
    if (pending) log(name, pending);
  });
}
