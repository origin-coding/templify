import { t } from '../utils/i18n';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { FieldDefinition, ScalarFieldDefinition } from '@templify/core';
import type {
  DesktopIssue,
  DesktopResult,
  GeneratedDocuments,
  ImportedRecords,
  InputSource,
  InspectedTemplate,
  OutputPreview,
  OutputSettings,
} from '../../shared/desktop-api';

export function emptyRecord(fields: readonly FieldDefinition[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.kind === 'collection' ? [] : initialValue(field)]),
  );
}
export function initialValue(field: ScalarFieldDefinition): string | boolean | null {
  if (field.hint.type === 'boolean') return false;
  return ['number', 'date', 'datetime'].includes(field.hint.type) ? null : '';
}
const defaultOutput = (): OutputSettings => ({
  mode: 'single',
  destination: '',
  pathTemplate: 'document-{$index}.docx',
});

export const useGenerationStore = defineStore('generation', () => {
  const template = ref<InspectedTemplate>();
  const mode = ref<'manual' | 'file'>('manual');
  const drafts = ref<{ id: number; values: Record<string, unknown> }[]>([]);
  const selectedId = ref<number>();
  const imported = ref<ImportedRecords>();
  const source = ref<InputSource>();
  const output = ref<OutputSettings>(defaultOutput());
  const preview = ref<OutputPreview>();
  const generated = ref<GeneratedDocuments>();
  const issues = ref<readonly DesktopIssue[]>([]);
  const warnings = ref<readonly DesktopIssue[]>([]);
  const exportedTemplate = ref<string>();
  const feedback = ref<{
    id: number;
    kind: 'success' | 'error';
    title: string;
    issues: readonly DesktopIssue[];
  }>();
  let feedbackId = 0;
  function notify(
    kind: 'success' | 'error',
    title: string,
    reportedIssues: readonly DesktopIssue[] = [],
  ) {
    feedback.value = { id: ++feedbackId, kind, title, issues: reportedIssues };
  }
  const step = ref(0);
  const reached = ref(0);
  const busy = ref(false);
  const phase = ref('');
  const version = ref(0);
  let nextId = 0;
  const fields = computed(() => template.value?.definition.fields ?? []);
  const current = computed(() => drafts.value.find((record) => record.id === selectedId.value));
  const count = computed(() =>
    mode.value === 'manual' ? drafts.value.length : (imported.value?.records.length ?? 0),
  );

  function invalidate() {
    const hadOutput = preview.value !== undefined || generated.value !== undefined;
    version.value++;
    preview.value = undefined;
    generated.value = undefined;
    issues.value = [];
    warnings.value = [];
    if (hadOutput) {
      const changed = version.value;
      void window.templify.invalidateOutput().catch((cause) => {
        if (version.value === changed)
          issues.value = [{ stage: 'desktop', code: 'UnexpectedFailure', details: String(cause) }];
      });
    }
  }
  function clearRecords() {
    drafts.value = [];
    selectedId.value = undefined;
    imported.value = undefined;
    source.value = undefined;
    invalidate();
  }
  function clearTask() {
    template.value = undefined;
    exportedTemplate.value = undefined;
    mode.value = 'manual';
    clearRecords();
    output.value = defaultOutput();
    step.value = 0;
    reached.value = 0;
  }
  function addRecord() {
    if (busy.value || !template.value) return;
    invalidate();
    const record = { id: ++nextId, values: emptyRecord(fields.value) };
    drafts.value.push(record);
    selectedId.value = record.id;
  }
  function removeRecord(id: number) {
    if (busy.value) return;
    const index = drafts.value.findIndex((record) => record.id === id);
    if (index < 0) return;
    drafts.value.splice(index, 1);
    if (selectedId.value === id)
      selectedId.value = drafts.value[Math.min(index, drafts.value.length - 1)]?.id;
    invalidate();
  }
  function updateOutput(value: Partial<OutputSettings>) {
    if (busy.value) return;
    output.value = { ...output.value, ...value };
    invalidate();
  }
  function snapshot(): readonly Readonly<Record<string, unknown>>[] | null {
    return mode.value === 'file'
      ? null
      : JSON.parse(JSON.stringify(drafts.value.map((record) => record.values)));
  }
  async function perform<T>(
    operation: () => Promise<DesktopResult<T>>,
    label: string,
    auxiliary = false,
  ): Promise<DesktopResult<T> | undefined> {
    if (busy.value) return;
    busy.value = true;
    phase.value = label;
    const started = version.value;
    try {
      const result = await operation();
      if (version.value !== started) return;
      if (result.status !== 'cancelled') {
        if (auxiliary) {
          if (result.status === 'error')
            notify('error', t('operationFailed', { operation: label }), [
              ...result.issues,
              ...result.warnings,
            ]);
        } else {
          issues.value = result.status === 'error' ? result.issues : [];
          warnings.value = result.warnings;
        }
      }
      return result;
    } catch (cause) {
      if (version.value === started) {
        const failures = [
          {
            stage: 'desktop',
            code: 'UnexpectedFailure',
            details: cause instanceof Error ? cause.message : String(cause),
          },
        ];
        if (auxiliary) notify('error', t('operationFailed', { operation: label }), failures);
        else issues.value = failures;
      }
    } finally {
      busy.value = false;
      phase.value = '';
    }
  }
  async function chooseTemplate() {
    const result = await perform(() => window.templify.selectTemplate(), t('parseTemplate'));
    if (!result || result.status === 'cancelled') return;
    const errors = issues.value;
    const reportedWarnings = warnings.value;
    clearTask();
    if (result.status === 'ok') {
      template.value = result.value;
      addRecord();
    }
    issues.value = errors;
    warnings.value = reportedWarnings;
  }
  async function switchMode(value: 'manual' | 'file') {
    if (value === mode.value || busy.value) return;
    const result = await perform(() => window.templify.resetInput(), t('switchMode'));
    if (result?.status !== 'ok') return;
    clearRecords();
    mode.value = value;
    if (value === 'manual') addRecord();
  }
  async function importFile(
    reuse = false,
    sheet?: string,
    encoding: 'utf8' | 'gbk' = source.value?.encoding ?? 'utf8',
  ) {
    const result = await perform(
      () => window.templify.importRecords({ ...(sheet ? { sheet } : {}), encoding }, reuse),
      t('readInput'),
    );
    if (!result || result.status === 'cancelled') return;
    preview.value = undefined;
    generated.value = undefined;
    imported.value = result.status === 'ok' ? result.value : undefined;
    source.value = result.status === 'ok' ? result.value.source : result.source;
    version.value++;
    if (result.status === 'ok')
      notify('success', t('imported', { count: result.value.records.length }));
  }
  async function exportExcel() {
    const result = await perform(() => window.templify.exportExcel(), t('saveExcelTitle'), true);
    if (result?.status === 'ok') {
      exportedTemplate.value = result.value;
      notify('success', t('excelSaved'));
      if (result.warnings.length) notify('error', t('excelCleanup'), result.warnings);
    }
  }
  async function openExcelTemplate() {
    await perform(() => window.templify.openExcelTemplate(), t('openExcel'), true);
  }
  async function openDocumentation() {
    await perform(() => window.templify.openDocumentation(), t('openDocs'), true);
  }
  async function go(target: number) {
    if (
      busy.value ||
      target < 0 ||
      target > 2 ||
      (target > reached.value && target !== step.value + 1)
    )
      return;
    if (target >= 1 && !template.value) return;
    if (target === 2) {
      if (!count.value) return;
      const result = await perform(
        () => window.templify.validateRecords(snapshot()),
        t('validateRecords'),
      );
      if (result?.status !== 'ok') return;
      preview.value = undefined;
      if (count.value !== 1 && output.value.mode === 'single')
        output.value = { ...output.value, mode: 'directory', destination: '' };
    }
    step.value = target;
    reached.value = Math.max(reached.value, target);
  }
  async function chooseOutput() {
    const result = await perform(
      () => window.templify.selectOutput(output.value.mode),
      t('outputTitle'),
      true,
    );
    if (result?.status === 'ok') updateOutput({ destination: result.value });
  }
  async function planOutput() {
    const result = await perform(
      () => window.templify.previewOutput(snapshot(), { ...output.value }),
      t('planOutput'),
    );
    preview.value = result?.status === 'ok' ? result.value : undefined;
  }
  async function generate() {
    if (!preview.value) return;
    const id = preview.value.id;
    const result = await perform(() => window.templify.generate(id), t('generate'), true);
    if (!result) return;
    preview.value = undefined;
    generated.value = result.status === 'ok' ? result.value : undefined;
    if (result.status === 'ok') warnings.value = result.warnings;
  }
  async function reset() {
    const result = await perform(() => window.templify.reset(), t('newTask'));
    if (result?.status === 'ok') clearTask();
  }
  async function openOutput() {
    await perform(() => window.templify.openOutput(), t('openOutput'), true);
  }
  return {
    template,
    mode,
    drafts,
    selectedId,
    imported,
    source,
    output,
    preview,
    generated,
    issues,
    warnings,
    exportedTemplate,
    feedback,
    step,
    reached,
    busy,
    phase,
    version,
    fields,
    current,
    count,
    invalidate,
    addRecord,
    removeRecord,
    updateOutput,
    chooseTemplate,
    switchMode,
    importFile,
    exportExcel,
    openExcelTemplate,
    openDocumentation,
    go,
    chooseOutput,
    planOutput,
    generate,
    reset,
    openOutput,
  };
});
