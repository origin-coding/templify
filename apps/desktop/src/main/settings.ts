import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  isLanguagePreference,
  type AppSettings,
  type LanguagePreference,
} from '../shared/settings';

/** Persists only application preferences; document tasks never enter this file. */
export class SettingsStore {
  private language: LanguagePreference = 'system';
  private pending: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly systemLocale: AppSettings['systemLocale'];
  constructor(filePath: string, systemLocale: AppSettings['systemLocale']) {
    this.filePath = filePath;
    this.systemLocale = systemLocale;
  }
  async load(): Promise<void> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (
        typeof value === 'object' &&
        value !== null &&
        'language' in value &&
        isLanguagePreference(value.language)
      )
        this.language = value.language;
    } catch {
      this.language = 'system';
    }
  }
  get(): AppSettings {
    return { language: this.language, systemLocale: this.systemLocale };
  }
  get locale() {
    return this.language === 'system' ? this.systemLocale : this.language;
  }
  async set(language: unknown): Promise<void> {
    if (!isLanguagePreference(language)) throw new Error('Invalid language preference.');
    this.language = language;
    const operation = this.pending.catch(() => undefined).then(() => this.save(language));
    this.pending = operation;
    await operation;
  }
  private async save(language: LanguagePreference): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(temporary, `${JSON.stringify({ language }, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
