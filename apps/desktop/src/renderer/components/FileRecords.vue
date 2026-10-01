<script setup lang="ts">
import { t } from '../utils/i18n';
import { useGenerationStore } from '../stores/generation';
const store = useGenerationStore();
</script>

<template>
  <div class="toolbar wrap">
    <div class="actions wrap">
      <TButton theme="primary" @click="store.importFile(false)">{{
        store.source ? t('reimport') : t('importFile')
      }}</TButton
      ><TButton variant="outline" @click="store.exportExcel">{{ t('downloadExcel') }}</TButton>
      <TButton v-if="store.exportedTemplate" variant="text" @click="store.openExcelTemplate">{{
        t('openTemplate')
      }}</TButton>
    </div>
  </div>
  <p class="muted">{{ t('importHint') }}</p>
  <p v-if="store.fields.some((field) => field.kind === 'collection')" class="muted">
    {{ t('collectionHint') }}
  </p>
  <div v-if="store.source" class="source-summary">
    <p class="path-text">{{ store.source.path }}</p>
    <div class="toolbar wrap">
      <label v-if="store.source.format === 'xlsx'" class="inline-control"
        >{{ t('mainSheet') }}
        <TSelect
          :value="store.source.sheet"
          :options="store.source.sheets.map((value) => ({ label: value, value }))"
          @change="store.importFile(true, String($event))"
        />
      </label>
      <label v-else class="inline-control"
        >{{ t('encoding') }}
        <TSelect
          :value="store.source.encoding"
          :options="[
            { label: 'UTF-8', value: 'utf8' },
            { label: 'GBK', value: 'gbk' },
          ]"
          @change="store.importFile(true, undefined, $event === 'gbk' ? 'gbk' : 'utf8')"
        />
      </label>
      <TButton variant="text" @click="store.importFile(true, store.source?.sheet)">{{
        t('reread')
      }}</TButton>
      <span>{{ t('inputSummary', { count: store.count }) }}</span>
    </div>
  </div>
  <RecordsPreview v-if="store.imported" :key="store.version" />
  <p v-else class="empty-state">{{ t('noImported') }}</p>
</template>
