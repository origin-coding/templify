import { setTimeout as delay } from 'node:timers/promises';

export async function waitForHttp(url, signal) {
  const timeout = AbortSignal.timeout(60_000);
  const combined = AbortSignal.any([signal, timeout]);
  return attempt(url, combined);
}

async function attempt(url, signal) {
  signal.throwIfAborted();
  try {
    const response = await fetch(url, { signal, cache: 'no-store' });
    await response.body?.cancel();
    if (response.ok) return;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (!['ECONNREFUSED', 'ECONNRESET'].includes(error.cause?.code)) throw error;
  }
  await delay(100, undefined, { signal });
  return attempt(url, signal);
}
