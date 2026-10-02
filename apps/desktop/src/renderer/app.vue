<script setup lang="ts">
import zhConfig from 'tdesign-vue-next/es/locale/zh_CN';
import enConfig from 'tdesign-vue-next/es/locale/en_US';
import type { GlobalConfigProvider } from 'tdesign-vue-next';
const { locale } = useI18n();
const configs = {
  'zh-CN': JSON.parse(JSON.stringify(zhConfig)) as GlobalConfigProvider,
  'en-US': JSON.parse(JSON.stringify(enConfig)) as GlobalConfigProvider,
};
</script>
<template>
  <TConfigProvider :global-config="configs[locale as keyof typeof configs]">
    <NuxtPage />
  </TConfigProvider>
</template>
