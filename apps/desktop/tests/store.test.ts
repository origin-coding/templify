import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerationStore } from '../src/renderer/stores/generation';
import { usePreferencesStore } from '../src/renderer/stores/preferences';
import { createI18n } from 'vue-i18n';
import { bindTranslations, t } from '../src/renderer/utils/i18n';
import { en, zh } from '../src/shared/messages';
import type { DesktopApi, DesktopResult, InspectedTemplate } from '../src/shared/desktop-api';
const template: InspectedTemplate = {
  path: 'template.docx',
  definition: {
    version: 1,
    kind: 'docx',
    fields: [
      { kind: 'scalar', name: 'name', hint: { type: 'string' } },
      {
        kind: 'collection',
        name: 'items',
        fields: [{ kind: 'scalar', name: 'label', hint: { type: 'string' } }],
      },
    ],
  },
};
const ok = <T>(value: T): DesktopResult<T> => ({ status: 'ok', value, warnings: [] });
const api = {
  selectTemplate: vi.fn<DesktopApi['selectTemplate']>(),
  reset: vi.fn<DesktopApi['reset']>(),
  resetInput: vi.fn<DesktopApi['resetInput']>(),
  validateRecords: vi.fn<DesktopApi['validateRecords']>(),
  importRecords: vi.fn<DesktopApi['importRecords']>(),
  previewOutput: vi.fn<DesktopApi['previewOutput']>(),
  generate: vi.fn<DesktopApi['generate']>(),
  previewPdf: vi.fn<DesktopApi['previewPdf']>(),
  invalidateOutput: vi.fn<DesktopApi['invalidateOutput']>(),
  exportExcel: vi.fn<DesktopApi['exportExcel']>(),
  getSettings: vi.fn<DesktopApi['getSettings']>(),
  setLanguage: vi.fn<DesktopApi['setLanguage']>(),
};
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.stubGlobal('window', { templify: api });
  api.selectTemplate.mockResolvedValue(ok(template));
  api.resetInput.mockResolvedValue(ok(true));
  api.invalidateOutput.mockResolvedValue(ok(true));
  api.reset.mockResolvedValue(ok(true));
  api.validateRecords.mockResolvedValue(ok(1));
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: { 'zh-CN': zh, 'en-US': en },
  });
  bindTranslations({
    locale: i18n.global.locale,
    t: (key, values) => i18n.global.t(key, values),
    setLocale: async (locale) => {
      i18n.global.locale.value = locale;
    },
  });
  api.getSettings.mockResolvedValue({ language: 'system', systemLocale: 'zh-CN' });
});
afterEach(() => {
  vi.restoreAllMocks();
});
describe('generation task state', () => {
  it('passes field rules to preview and export, invalidates old previews, and clears rules on template replacement', async () => {
    const store = useGenerationStore();
    await store.chooseTemplate();
    const rules = [
      {
        path: ['enabled'] as const,
        format: { type: 'boolean' as const, trueText: 'Yes', falseText: 'No' },
      },
    ];
    store.pdfPreviewId = 4;
    store.setFormats(rules);
    expect(store.pdfPreviewId).toBeUndefined();
    expect(api.invalidateOutput).toHaveBeenCalledWith(false);
    api.previewPdf.mockResolvedValue({ status: 'cancelled' });
    await store.previewPdf(0);
    expect(api.previewPdf.mock.calls.at(-1)?.[2]).toEqual({ formats: rules });
    api.previewOutput.mockResolvedValue({ status: 'cancelled' });
    await store.planOutput();
    expect(api.previewOutput.mock.calls.at(-1)?.[2]).toEqual({ formats: rules });
    await store.chooseTemplate();
    expect(store.formats).toEqual([]);
  });
  it('opens a PDF from IPC bytes and releases its object URL when data changes', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-pdf');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    api.previewPdf.mockResolvedValue(ok({ id: 5, bytes: new Uint8Array([37, 80, 68, 70]) }));
    const store = useGenerationStore();
    await store.chooseTemplate();
    await store.previewPdf(0);
    expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(store.pdfPreviewId).toBe(5);
    expect(store.pdfPreviewOpen).toBe(true);
    expect(store.pdfPreviewSource).toBe('blob:test-pdf');
    store.updateOutput({ destination: 'output.docx' });
    expect(revoke).not.toHaveBeenCalled();
    store.invalidate();
    expect(revoke).toHaveBeenCalledWith('blob:test-pdf');
    expect(store.pdfPreviewSource).toBeUndefined();
    expect(store.pdfPreviewOpen).toBe(false);
  });
  it('keeps PDF content when output settings change and invalidates it when record data changes', () => {
    const store = useGenerationStore();
    store.pdfPreviewId = 7;
    store.output = { ...store.output, destination: 'out.docx' };
    store.updateOutput({ documentFormat: 'pdf' });
    expect(store.pdfPreviewId).toBe(7);
    expect(store.output.destination).toBe('');
    expect(store.output.pathTemplate).toBe('document-{$index}.pdf');
    expect(api.invalidateOutput).toHaveBeenCalledWith(true);
    store.invalidate();
    expect(store.pdfPreviewId).toBeUndefined();
    expect(api.invalidateOutput).toHaveBeenLastCalledWith(false);
  });
  it('changes language without changing the task and reports failed preference persistence', async () => {
    const store = useGenerationStore();
    const preferences = usePreferencesStore();
    await preferences.load();
    await store.chooseTemplate();
    store.current!.values.name = '中文数据';
    const selected = store.selectedId;
    api.setLanguage.mockResolvedValue(ok({ language: 'en-US', systemLocale: 'zh-CN' }));
    await preferences.setLanguage('en-US');
    expect(t('editRecord', { index: 1 })).toBe('Edit record 1');
    expect(t('namingHint')).toContain('{department}/{name}.docx');
    expect(store.selectedId).toBe(selected);
    expect(store.current!.values.name).toBe('中文数据');
    const issue = { stage: 'settings', code: 'SettingsSaveFailed', details: '' };
    api.setLanguage.mockResolvedValue({ status: 'error', issue, issues: [issue], warnings: [] });
    await preferences.setLanguage('system');
    expect(preferences.error).toBe('SettingsSaveFailed');
    expect(preferences.locale).toBe('zh-CN');
    expect(store.count).toBe(1);
    expect(api.reset).not.toHaveBeenCalled();
  });
  it('keeps export feedback separate from input diagnostics and preserves the exported path across edits', async () => {
    const store = useGenerationStore();
    await store.chooseTemplate();
    const issue = { stage: 'input', code: 'InvalidInputValue', details: '' };
    store.issues = [issue];
    api.exportExcel.mockResolvedValue({
      status: 'error',
      issue: { ...issue, stage: 'excel-template', code: 'OutputWriteFailed' },
      issues: [{ ...issue, stage: 'excel-template', code: 'OutputWriteFailed' }],
      warnings: [],
    });
    await store.exportExcel();
    expect(store.issues).toEqual([issue]);
    expect(store.feedback?.kind).toBe('error');
    expect(store.count).toBe(1);
    api.exportExcel.mockResolvedValue(ok('input.xlsx'));
    await store.exportExcel();
    expect(store.feedback?.title).toBe('Excel 模板已保存');
    expect(store.issues).toEqual([issue]);
    store.invalidate();
    expect(store.exportedTemplate).toBe('input.xlsx');
    await store.chooseTemplate();
    expect(store.exportedTemplate).toBeUndefined();
  });
  it('preserves back navigation, validates reached output and does not leak UI IDs', async () => {
    const store = useGenerationStore();
    await store.chooseTemplate();
    expect(store.count).toBe(1);
    expect(store.current?.values.items).toEqual([]);
    await store.go(2);
    expect(store.step).toBe(0);
    await store.go(1);
    store.current!.values.name = 'Alice';
    store.invalidate();
    await store.go(2);
    expect(api.validateRecords).toHaveBeenCalledWith([{ name: 'Alice', items: [] }]);
    await store.go(1);
    expect(store.current?.values.name).toBe('Alice');
    api.validateRecords.mockResolvedValue({
      status: 'error',
      issue: { stage: 'input', code: 'InvalidInputValue', details: '' },
      issues: [{ stage: 'input', code: 'InvalidInputValue', details: '' }],
      warnings: [],
    });
    await store.go(2);
    expect(store.step).toBe(1);
  });
  it('maintains record selection and invalidates plans and results when records change', async () => {
    const store = useGenerationStore();
    await store.chooseTemplate();
    const first = store.selectedId!;
    store.addRecord();
    const second = store.selectedId!;
    expect(second).not.toBe(first);
    store.addRecord();
    store.removeRecord(store.selectedId!);
    expect(store.selectedId).toBe(second);
    store.preview = { id: 1, documentCount: 2, mode: 'directory', destination: 'out', paths: [] };
    store.generated = { documentCount: 2, paths: [], replacedCount: 0 };
    store.removeRecord(second);
    expect(store.selectedId).toBe(first);
    expect(store.preview).toBeUndefined();
    expect(store.generated).toBeUndefined();
    store.removeRecord(first);
    expect(store.count).toBe(0);
    expect(store.current).toBeUndefined();
  });
  it('clears mode changes, replaces imports and preserves cancelled file selections', async () => {
    const store = useGenerationStore();
    await store.chooseTemplate();
    await store.go(1);
    store.current!.values.name = 'Alice';
    await store.switchMode('file');
    expect(store.drafts).toHaveLength(0);
    const source = {
      path: 'input.csv',
      format: 'csv' as const,
      sheets: [],
      encoding: 'utf8' as const,
    };
    api.importRecords.mockResolvedValue(
      ok({ source, records: [{ name: 'A' }, { name: 'B' }], origins: [] }),
    );
    await store.importFile();
    expect(store.count).toBe(2);
    api.importRecords.mockResolvedValue({ status: 'cancelled' });
    await store.importFile();
    expect(store.count).toBe(2);
    api.importRecords.mockResolvedValue(ok({ source, records: [{ name: 'C' }], origins: [] }));
    await store.importFile();
    expect(store.count).toBe(1);
    api.importRecords.mockResolvedValue({
      status: 'error',
      issue: { stage: 'input', code: 'InvalidInputValue', details: '' },
      issues: [{ stage: 'input', code: 'InvalidInputValue', details: '' }],
      warnings: [],
      source,
    });
    await store.importFile();
    expect(store.count).toBe(0);
    expect(store.source?.path).toBe('input.csv');
    await store.switchMode('manual');
    expect(store.current?.values.name).toBe('');
  });
  it('preserves cancellation, clears failed template replacement and ignores stale responses', async () => {
    const store = useGenerationStore();
    await store.chooseTemplate();
    store.current!.values.name = 'Alice';
    api.selectTemplate.mockResolvedValue({ status: 'cancelled' });
    await store.chooseTemplate();
    expect(store.current?.values.name).toBe('Alice');
    api.selectTemplate.mockResolvedValue({
      status: 'error',
      issue: { stage: 'template', code: 'InvalidTemplate', details: '' },
      issues: [{ stage: 'template', code: 'InvalidTemplate', details: '' }],
      warnings: [],
    });
    await store.chooseTemplate();
    expect(store.template).toBeUndefined();
    expect(store.count).toBe(0);
    const deferred = Promise.withResolvers<DesktopResult<InspectedTemplate>>();
    api.selectTemplate.mockReturnValue(deferred.promise);
    const pending = store.chooseTemplate();
    store.invalidate();
    deferred.resolve(ok(template));
    await pending;
    expect(store.template).toBeUndefined();
    expect(store.busy).toBe(false);
  });
});
