import type { Ref } from 'vue';
import type { MessageKey } from '../../shared/messages';
import type { AppLocale } from '../../shared/settings';

interface TranslationContext {
  readonly locale: Ref<string>;
  readonly t: (key: MessageKey, values: Record<string, string | number>) => string;
  readonly setLocale: (locale: AppLocale) => Promise<void>;
}

let context: TranslationContext;

export function bindTranslations(value: TranslationContext): void {
  context = value;
}

export function currentLocale(): string {
  return context.locale.value;
}

export function setAppLocale(locale: AppLocale): Promise<void> {
  return context.setLocale(locale);
}

export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return context.t(key, values);
}
