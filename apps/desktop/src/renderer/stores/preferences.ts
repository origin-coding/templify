import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { setAppLocale } from '../utils/i18n';
import type { AppLocale, LanguagePreference } from '../../shared/settings';
export const usePreferencesStore = defineStore('preferences', () => {
  const language = ref<LanguagePreference>('system');
  const systemLocale = ref<AppLocale>('en-US');
  const saving = ref(false);
  const error = ref<'SettingsSaveFailed' | 'SettingsReadFailed' | ''>('');
  const locale = computed(() =>
    language.value === 'system' ? systemLocale.value : language.value,
  );
  function apply() {
    return setAppLocale(locale.value);
  }
  async function load() {
    try {
      const settings = await window.templify.getSettings();
      language.value = settings.language;
      systemLocale.value = settings.systemLocale;
    } catch {
      systemLocale.value = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
      error.value = 'SettingsReadFailed';
    }
    await apply();
  }
  async function setLanguage(value: LanguagePreference) {
    if (saving.value) return;
    language.value = value;
    saving.value = true;
    error.value = '';
    try {
      await apply();
      const result = await window.templify.setLanguage(value);
      if (result.status !== 'ok') error.value = 'SettingsSaveFailed';
    } catch {
      error.value = 'SettingsSaveFailed';
    } finally {
      saving.value = false;
    }
  }
  return { language, locale, saving, error, load, setLanguage };
});
