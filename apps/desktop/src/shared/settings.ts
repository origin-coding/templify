import type { RenderDefaults } from '@templify/core';
export type LanguagePreference = 'system' | 'zh-CN' | 'en-US';
export type AppLocale = 'zh-CN' | 'en-US';
export interface AppSettings {
  readonly renderDefaults?: RenderDefaults;
  readonly language: LanguagePreference;
  readonly systemLocale: AppLocale;
}
export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'zh-CN' || value === 'en-US';
}
export function systemLocale(languages: readonly string[]): AppLocale {
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}
