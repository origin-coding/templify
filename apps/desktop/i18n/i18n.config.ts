import { en, zh } from '../src/shared/messages';

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en-US',
  messages: { 'zh-CN': zh, 'en-US': en },
}));
