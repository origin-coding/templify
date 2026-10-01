import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-09-26',
  ssr: false,
  srcDir: 'src/renderer',
  ignore: ['dist', 'dist/**', '.desktop', '.desktop/**'],
  css: ['~/assets/desktop.css'],
  app: { head: { title: 'Templify' } },
  devServer: { host: 'localhost', port: 5173 },
  devtools: { enabled: false },
  modules: ['@tdesign-vue-next/nuxt', '@pinia/nuxt', '@nuxtjs/i18n'],
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts',
  },
  pinia: { storesDirs: ['./src/renderer/stores'] },
  tdesign: {
    esm: false,
  },
  router: { options: { hashMode: true } },
  experimental: {
    clientNodeCompat: false,
    appManifest: false,
    payloadExtraction: false,
  },
  nitro: {
    baseURL: '/',
    output: { publicDir: fileURLToPath(new URL('./.desktop/renderer', import.meta.url)) },
    prerender: { crawlLinks: false, routes: ['/'] },
  },
});
