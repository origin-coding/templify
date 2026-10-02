<script setup lang="ts">
import type { PDFViewerConfig } from '@embedpdf/vue-pdf-viewer';
import wasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import { useGenerationStore } from '../stores/generation';
import { usePreferencesStore } from '../stores/preferences';
import { t } from '../utils/i18n';

const store = useGenerationStore();
const preferences = usePreferencesStore();
const PDFViewer = defineAsyncComponent(() =>
  import('@embedpdf/vue-pdf-viewer').then((module) => module.PDFViewer),
);
const config = computed<PDFViewerConfig>(() => ({
  src: store.pdfPreviewSource,
  wasmUrl: new URL(wasmUrl, document.baseURI).href,
  fontFallback: null,
  theme: { preference: 'light' },
  tabBar: 'never',
  i18n: { defaultLocale: preferences.locale === 'zh-CN' ? 'zh-CN' : 'en', fallbackLocale: 'en' },
  disabledCategories: [
    'annotation',
    'redaction',
    'form',
    'history',
    'insert',
    'document-open',
    'document-close',
    'document-protect',
    'document-print',
    'document-export',
    'document-capture',
    'capture',
    'panel-comment',
  ],
}));
</script>

<template>
  <TDialog
    v-model:visible="store.pdfPreviewOpen"
    :header="t('pdfPreviewTitle')"
    :footer="false"
    width="min(1200px, calc(100vw - 48px))"
    placement="top"
    top="24px"
    :destroy-on-close="true"
    class="pdf-preview-dialog"
  >
    <TAlert theme="warning" class="pdf-notice">{{ t('pdfBestEffort') }}</TAlert>
    <div v-if="store.pdfPreviewOpen && store.pdfPreviewSource" class="pdf-viewer-content">
      <PDFViewer
        :key="store.pdfPreviewId"
        :config="config"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </TDialog>
</template>

<style scoped>
.pdf-viewer-content {
  height: calc(100vh - 260px);
  min-height: 280px;
}
</style>
