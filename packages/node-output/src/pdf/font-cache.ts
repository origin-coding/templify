import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface RemoteFontCacheOptions {
  readonly directory: string;
  readonly fetch?: (url: string) => Promise<Uint8Array>;
  readonly onDownload?: () => void;
}

export function defaultFontCacheDirectory(): string {
  const base =
    process.platform === 'win32'
      ? (process.env.LOCALAPPDATA ?? os.tmpdir())
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches')
        : (process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'));
  return path.join(base, 'templify', 'pdf-fonts', 'reamkit-1.29');
}

/** Only remote fallback bytes enter this cache. Filesystem failures are recoverable. */
export function createRemoteFontCache(
  options: RemoteFontCacheOptions,
): (url: string) => Promise<Uint8Array> {
  const pending = new Map<string, Promise<Uint8Array>>();
  return (url) => {
    const cached = pending.get(url);
    if (cached) return cached;
    const download = load(url);
    pending.set(url, download);
    void download.catch(() => pending.delete(url));
    return download;
  };

  async function load(url: string): Promise<Uint8Array> {
    const key = createHash('sha256').update(url).digest('hex');
    const target = path.join(options.directory, `${key}.json`);
    try {
      const entry = JSON.parse(await readFile(target, 'utf8')) as { bytes: string; digest: string };
      const bytes = Buffer.from(entry.bytes, 'base64');
      if (
        validFontBytes(bytes) &&
        createHash('sha256').update(bytes).digest('hex') === entry.digest
      )
        return bytes;
    } catch {
      /* Missing, unreadable or corrupt entries fall through to the network. */
    }
    options.onDownload?.();
    const bytes = await (options.fetch ?? downloadFont)(url);
    if (!validFontBytes(bytes)) throw new Error('Invalid remote font data.');
    const temporary = path.join(options.directory, `${key}-${randomUUID()}.tmp`);
    try {
      await mkdir(options.directory, { recursive: true });
      await writeFile(
        temporary,
        JSON.stringify({
          bytes: Buffer.from(bytes).toString('base64'),
          digest: createHash('sha256').update(bytes).digest('hex'),
        }),
        { flag: 'wx' },
      );
      await rename(temporary, target);
    } catch {
      /* The downloaded bytes remain usable if persistence fails. */
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return bytes;
  }
}

export function validFontBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes.length > 64 * 1024 * 1024) return false;
  const signature = Buffer.from(bytes.subarray(0, 4)).toString('hex');
  return ['00010000', '4f54544f', '74727565', '74797031'].includes(signature);
}

async function downloadFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Font download failed (${response.status}).`);
  const length = Number(response.headers.get('content-length'));
  if (length > 64 * 1024 * 1024) throw new Error('Font download is too large.');
  return new Uint8Array(await response.arrayBuffer());
}
