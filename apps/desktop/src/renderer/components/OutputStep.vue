<script setup lang="ts">
import { t } from '../utils/i18n';
import { useGenerationStore } from '../stores/generation';
import type { OutputMode } from '../../shared/desktop-api';
const store = useGenerationStore();
const pathPage = ref(1);
function changeMode(value: unknown) {
  store.updateOutput({ mode: value as OutputMode, destination: '' });
}
function changeFormat(value: unknown) {
  if (value === 'docx' || value === 'pdf') store.updateOutput({ documentFormat: value });
}
const paths = computed(() =>
  (store.preview?.paths ?? []).map((value, index) => ({ index: index + 1, path: value })),
);
const columns = computed(() => [
  { colKey: 'index', title: t('index'), width: 80 },
  { colKey: 'path', title: t('documentPath') },
]);
watch(
  () => store.preview?.id,
  () => {
    pathPage.value = 1;
  },
);
</script>

<template>
  <p class="muted">
    {{ store.template?.path.split(/[\\/]/).at(-1) }} ·
    {{ t('outputSummary', { count: store.count }) }}
  </p>
  <div class="field-list output-fields">
    <div class="field-row">
      <label>{{ t('documentFormat') }}</label>
      <TRadioGroup :value="store.output.documentFormat ?? 'docx'" @change="changeFormat">
        <TRadioButton value="docx">DOCX</TRadioButton><TRadioButton value="pdf">PDF</TRadioButton>
      </TRadioGroup>
    </div>
    <div class="field-row">
      <label>{{ t('outputMode') }}</label
      ><TRadioGroup :value="store.output.mode" @change="changeMode"
        ><TRadioButton value="single" :disabled="store.count !== 1">{{
          t('singleDocx')
        }}</TRadioButton
        ><TRadioButton value="directory">{{ t('directory') }}</TRadioButton
        ><TRadioButton value="zip">ZIP</TRadioButton></TRadioGroup
      >
    </div>
    <p v-if="store.count !== 1" class="muted">
      {{ t('singleHint') }}
    </p>
    <div v-if="store.output.mode !== 'single'" class="field-row">
      <label>{{ t('mergedPdf') }}</label>
      <TCheckbox
        :checked="store.output.mergedPdf !== undefined"
        @change="store.updateOutput({ mergedPdf: $event ? 'merged.pdf' : undefined })"
        >{{ t('includeMergedPdf') }}</TCheckbox
      >
    </div>
    <div v-if="store.output.mergedPdf !== undefined" class="field-row">
      <label for="merged-pdf-path">{{ t('mergedPdfPath') }}</label>
      <TInput
        id="merged-pdf-path"
        :value="store.output.mergedPdf"
        @change="store.updateOutput({ mergedPdf: String($event) })"
      />
    </div>
    <div class="field-row">
      <label>{{ t('outputLocation') }}</label>
      <div class="destination-control">
        <span class="path-text">{{ store.output.destination || t('notSelected') }}</span
        ><TButton variant="outline" @click="store.chooseOutput">{{ t('chooseLocation') }}</TButton>
      </div>
    </div>
    <div v-if="store.output.mode !== 'single'" class="field-row">
      <label for="path-template">{{ t('pathTemplate') }}</label
      ><TInput
        id="path-template"
        :value="store.output.pathTemplate"
        @change="store.updateOutput({ pathTemplate: String($event) })"
      />
    </div>
    <p v-if="store.output.mode !== 'single'" class="muted">
      {{ t('namingFormatHint', { format: store.output.documentFormat ?? 'docx' }) }}
    </p>
    <div class="actions">
      <TButton variant="outline" :disabled="!store.output.destination" @click="store.planOutput">{{
        t('previewPaths')
      }}</TButton>
      <TTooltip :content="t('previewHint')" trigger="hover">
        <button
          type="button"
          class="preview-help"
          :aria-label="t('previewHint')"
          :title="t('previewHint')"
        >
          ?
        </button>
      </TTooltip>
    </div>
  </div>
  <p class="muted">{{ t('pdfBestEffort') }}</p>
  <section v-if="store.preview" class="output-preview">
    <div class="preview-heading">
      <strong
        >{{ t('docxCount', { count: store.preview.documentCount }) }} ·
        {{ store.preview.mode === 'zip' ? t('zipEntries') : t('documentPath') }}</strong
      >
    </div>
    <p v-if="store.preview.mode === 'single'" class="path-text">{{ store.preview.paths[0] }}</p>
    <TTable
      v-else
      row-key="index"
      size="small"
      :data="paths"
      :columns="columns"
      :pagination="
        paths.length > 20
          ? { current: pathPage, pageSize: 20, total: paths.length, showPageSize: false }
          : undefined
      "
      @page-change="pathPage = $event.current"
    >
      <template #path="{ row }"
        ><span class="path-text">{{ row.path }}</span></template
      >
    </TTable>
  </section>
  <section v-if="store.generated" class="output-preview output-result" role="status">
    <p class="result-message">
      ✓
      {{
        t(store.output.mode === 'zip' ? 'generatedZip' : 'generated', {
          count: store.generated.documentCount,
        })
      }}
    </p>
    <div class="actions wrap">
      <TButton v-if="store.output.mode === 'single'" @click="store.openOutputFile">{{
        t('openFile')
      }}</TButton>
      <TButton @click="store.openOutput">{{
        t(store.output.mode === 'directory' ? 'openDirectory' : 'showInFolder')
      }}</TButton
      ><TButton variant="outline" @click="store.go(1)">{{ t('returnEdit') }}</TButton
      ><TButton variant="outline" @click="store.reset">{{ t('newTask') }}</TButton>
    </div>
  </section>
</template>
