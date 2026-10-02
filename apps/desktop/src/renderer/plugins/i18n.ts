import { bindTranslations } from '../utils/i18n';
import { usePreferencesStore } from '../stores/preferences';
export default defineNuxtPlugin({
  name: 'language-preferences',
  dependsOn: ['i18n:plugin:route-locale-detect'],
  async setup(app) {
    const { $i18n } = app;
    bindTranslations({
      locale: $i18n.locale,
      t: (key, values) => $i18n.t(key, values),
      setLocale: (locale) => $i18n.setLocale(locale),
    });
    await usePreferencesStore().load();
  },
});
