import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ream } from 'reamkit';
import { createDocx } from '../../core/tests/docx-fixture';
import { createRemoteFontCache } from '@/pdf/font-cache';
import { createNodePdfConverter } from '@/pdf/node-pdf-converter';

const font = new Uint8Array(
  await readFile(new URL('./fixtures/arimo-regular.ttf', import.meta.url)),
);
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'templify-font-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('persistent remote font cache', () => {
  it('coalesces downloads, persists across instances, and repairs corrupt entries', async () => {
    const fetch = vi.fn<() => Promise<Uint8Array>>(async () => font);
    const cached = createRemoteFontCache({ directory: root, fetch });
    await Promise.all([cached('https://fonts.test/arimo'), cached('https://fonts.test/arimo')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await createRemoteFontCache({ directory: root, fetch })('https://fonts.test/arimo');
    expect(fetch).toHaveBeenCalledTimes(1);
    await writeFile(path.join(root, (await readdir(root))[0]!), '{"bytes":"corrupt"}');
    expect(
      await createRemoteFontCache({ directory: root, fetch })('https://fonts.test/arimo'),
    ).toEqual(font);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('recovers from write failures and retries failed downloads', async () => {
    const blocked = path.join(root, 'file');
    await writeFile(blocked, 'not a directory');
    const fetch = vi
      .fn<() => Promise<Uint8Array>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(font);
    const cached = createRemoteFontCache({ directory: blocked, fetch });
    await expect(cached('https://fonts.test/arimo')).rejects.toThrow('offline');
    expect(await cached('https://fonts.test/arimo')).toEqual(font);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await readFile(blocked, 'utf8')).toBe('not a directory');
  });
});

describe('Node PDF conversion', () => {
  it('converts with externally supplied fonts without downloading or persisting them', async () => {
    const fetchFont = vi.fn<() => Promise<Uint8Array>>(async () => {
      throw new Error('offline');
    });
    const converter = createNodePdfConverter({
      cacheDirectory: root,
      fetchFont,
      localFonts: async (requests) => requests.map((request) => ({ ...request, bytes: font })),
    });
    const result = await converter.convert(createDocx([['Alice 123']]));
    expect(Buffer.from(result.bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect(JSON.stringify(Ream.parse(result.bytes).flow.body)).toContain('Alice');
    expect(fetchFont).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });
  it('falls back after local permission denial and reuses remote fonts offline', async () => {
    const fetchFont = vi.fn<() => Promise<Uint8Array>>(async () => font);
    const converter = createNodePdfConverter({
      cacheDirectory: root,
      fetchFont,
      localFonts: async () => {
        throw new Error('permission denied');
      },
    });
    await converter.convert(createDocx([['Alice']]));
    expect(fetchFont).toHaveBeenCalled();
    const offline = createNodePdfConverter({
      cacheDirectory: root,
      fetchFont: async () => {
        throw new Error('offline');
      },
    });
    const result = await offline.convert(createDocx([['Bob']]));
    expect(JSON.stringify(Ream.parse(result.bytes).flow.body)).toContain('Bob');
  });
  it('fails explicitly if available fonts cannot represent a required character', async () => {
    const converter = createNodePdfConverter({ cacheDirectory: root, fetchFont: async () => font });
    await expect(converter.convert(createDocx([['汉']]))).rejects.toThrow('No usable PDF font');
  });
});
