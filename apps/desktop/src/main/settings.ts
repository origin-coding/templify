import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { validateRenderOptions, type RenderDefaults } from '@templify/core';
import {
  isLanguagePreference,
  type AppSettings,
  type LanguagePreference,
} from '../shared/settings';

function isRenderDefaults(value: unknown): value is RenderDefaults {
  return (
    value !== undefined &&
    value !== null &&
    validateRenderOptions(
      { version: 1, kind: 'docx', fields: [] },
      { defaults: value as RenderDefaults },
    ).ok
  );
}

/** Persists only application preferences; document tasks never enter this file. */
export class SettingsStore {
  private renderDefaults: RenderDefaults = {};
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
      if (
        typeof value === 'object' &&
        value !== null &&
        'renderDefaults' in value &&
        isRenderDefaults(value.renderDefaults)
      )
        this.renderDefaults = value.renderDefaults;
    } catch {
      this.language = 'system';
    }
  }
  get(): AppSettings {
    return {
      language: this.language,
      systemLocale: this.systemLocale,
      ...(Object.keys(this.renderDefaults).length ? { renderDefaults: this.renderDefaults } : {}),
    };
  }
  get locale() {
    return this.language === 'system' ? this.systemLocale : this.language;
  }
  async set(language: unknown): Promise<void> {
    if (!isLanguagePreference(language)) throw new Error('Invalid language preference.');
    this.language = language;
    const snapshot = {
      language,
      ...(Object.keys(this.renderDefaults).length ? { renderDefaults: this.renderDefaults } : {}),
    };
    const operation = this.pending.catch(() => undefined).then(() => this.save(snapshot));
    this.pending = operation;
    await operation;
  }
  async setRenderDefaults(value: unknown): Promise<void> {
    if (!isRenderDefaults(value)) throw new Error('Invalid render defaults.');
    this.renderDefaults = structuredClone(value);
    const snapshot = { language: this.language, renderDefaults: this.renderDefaults };
    const operation = this.pending.catch(() => undefined).then(() => this.save(snapshot));
    this.pending = operation;
    await operation;
  }
  private async save(settings: {
    language: LanguagePreference;
    renderDefaults?: RenderDefaults;
  }): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
