import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/main/settings';
import { systemLocale } from '../src/shared/settings';
let root: string;
let filePath: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'templify-settings-'));
  filePath = path.join(root, 'settings.json');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
describe('language preferences', () => {
  it('follows the system without creating a file until the user chooses a preference', async () => {
    const store = new SettingsStore(filePath, systemLocale(['zh-Hans-CN', 'en-US']));
    await store.load();
    expect(store.get()).toEqual({ language: 'system', systemLocale: 'zh-CN' });
    expect(await readdir(root)).toEqual([]);
    await store.set('en-US');
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ language: 'en-US' });
    expect(await readdir(root)).toEqual(['settings.json']);
    const restarted = new SettingsStore(filePath, 'zh-CN');
    await restarted.load();
    expect(restarted.locale).toBe('en-US');
    await restarted.set('system');
    expect(restarted.locale).toBe('zh-CN');
  });
  it('falls back for malformed or unsupported preferences and uses English for other system languages', async () => {
    expect(systemLocale(['fr-FR'])).toBe('en-US');
    expect(systemLocale([])).toBe('en-US');
    await Promise.all(
      ['invalid JSON', '{"language":"unsupported"}', 'null', '{"task":{}}'].map(
        async (text, index) => {
          const invalidPath = path.join(root, `invalid-${index}.json`);
          await writeFile(invalidPath, text);
          const store = new SettingsStore(invalidPath, 'en-US');
          await store.load();
          expect(store.get().language).toBe('system');
        },
      ),
    );
  });
  it('retains the active language if persistence fails and never alters the obstructing file', async () => {
    await writeFile(filePath, 'obstruction');
    const store = new SettingsStore(path.join(filePath, 'settings.json'), 'zh-CN');
    await expect(store.set('en-US')).rejects.toThrow(/EEXIST|ENOTDIR/);
    expect(store.locale).toBe('en-US');
    expect(await readFile(filePath, 'utf8')).toBe('obstruction');
    expect(await readdir(root)).toEqual(['settings.json']);
  });
  it('serializes writes and rejects unsupported values without changing the preference', async () => {
    const store = new SettingsStore(filePath, 'en-US');
    await Promise.all([store.set('en-US'), store.set('zh-CN')]);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ language: 'zh-CN' });
    await expect(store.set('../other-file')).rejects.toThrow('Invalid language preference.');
    expect(store.locale).toBe('zh-CN');
  });
});
