import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, dialog, shell } from 'electron';
import { publishArtifacts, createNodePdfConverter } from '@templify/node-output';
import { readPdfText } from '../../../packages/node-output/tests/pdf-fixture';
import { createDocx, readArchive } from '../../../packages/core/tests/docx-fixture';
import { createXlsx } from '../../../packages/tabular-input/tests/xlsx-fixture';
import { DocumentWorkflow } from '../src/main/document-workflow';
import type { DesktopResult, OutputMode } from '../src/shared/desktop-api';

const mocks = vi.hoisted(() => ({
  open: vi.fn<typeof dialog.showOpenDialog>(),
  save: vi.fn<typeof dialog.showSaveDialog>(),
  confirm: vi.fn<typeof dialog.showMessageBox>(),
  openPath: vi.fn<typeof shell.openPath>(),
  show: vi.fn<typeof shell.showItemInFolder>(),
}));
vi.mock('electron', () => ({
  dialog: { showOpenDialog: mocks.open, showSaveDialog: mocks.save, showMessageBox: mocks.confirm },
  shell: { openPath: mocks.openPath, showItemInFolder: mocks.show },
}));
vi.mock('@templify/node-output', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@templify/node-output')>();
  return {
    ...actual,
    publishArtifacts: vi.fn<typeof actual.publishArtifacts>(actual.publishArtifacts),
  };
});
const window = {
  isDestroyed: () => false,
  webContents: { send: vi.fn<() => void>() },
} as unknown as BrowserWindow;
function value<T>(result: DesktopResult<T>): T {
  if (result.status !== 'ok') throw new Error(JSON.stringify(result));
  return result.value;
}
let root: string;
let workflow: DocumentWorkflow;
let templatePath: string;
async function select(bytes = createDocx([['{name}']])) {
  await writeFile(templatePath, bytes);
  mocks.open.mockResolvedValueOnce({ canceled: false, filePaths: [templatePath] });
  return workflow.selectTemplate(window);
}
async function plan(
  mode: OutputMode,
  records: readonly Record<string, unknown>[] | null,
  destination: string,
  nativeSelection = false,
) {
  if (nativeSelection) {
    mocks.save.mockResolvedValueOnce({ canceled: false, filePath: destination });
    value(await workflow.selectOutput(window, mode));
  }
  return workflow.previewOutput(records, {
    mode,
    destination,

    pathTemplate: '{name}.docx',
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(os.tmpdir(), 'templify-desktop-'));
  templatePath = path.join(root, 'template.docx');
  workflow = new DocumentWorkflow();
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

describe('desktop batch workflow', () => {
  it('uses the same formatting for examples, PDF previews, and exported DOCX', async () => {
    const font = new Uint8Array(
      await readFile(
        new URL('../../../packages/node-output/tests/fixtures/arimo-regular.ttf', import.meta.url),
      ),
    );
    workflow = new DocumentWorkflow(() => 'en-US', {
      pdfConverter: createNodePdfConverter({
        localFonts: async (requests) => requests.map((request) => ({ ...request, bytes: font })),
      }),
    });
    value(await select(createDocx([['{enabled:boolean} {approved:boolean} {amount:number}']])));
    const options = {
      defaults: {
        boolean: { trueText: 'Yes', falseText: 'No' },
        number: { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false },
      },
      formats: [
        {
          path: ['approved'] as const,
          format: { type: 'boolean' as const, trueText: 'Pass', falseText: 'Fail' },
        },
      ],
    };
    expect(value(await workflow.formatExamples(options, true))).toContainEqual({
      path: ['approved'],
      text: 'Pass / Fail',
    });
    const records = [{ enabled: true, approved: false, amount: 12 }];
    const preview = value(await workflow.previewPdf(records, 0, options));
    expect(readPdfText(preview.bytes)).toContain('Yes Fail 12.00');
    const destination = path.join(root, 'formatted.docx');
    const planned = value(
      await workflow.previewOutput(
        records,
        { mode: 'single', destination, pathTemplate: 'formatted.docx' },
        options,
      ),
    );
    value(await workflow.generate(window, planned.id));
    expect(readArchive(await readFile(destination))['word/document.xml']!.toString()).toContain(
      'Yes Fail 12.00',
    );
    expect(
      await workflow.formatExamples({ defaults: { date: { pattern: 'invalid' } } }, false),
    ).toMatchObject({ status: 'error', issue: { code: 'InvalidRenderOptions' } });
  });
  it('previews selected/all records before export and reuses PDF conversion for ordered merged output', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const font = new Uint8Array(
      await readFile(
        new URL('../../../packages/node-output/tests/fixtures/arimo-regular.ttf', import.meta.url),
      ),
    );
    const converter = createNodePdfConverter({
      localFonts: async (requests) => requests.map((request) => ({ ...request, bytes: font })),
    });
    const convert = vi.spyOn(converter, 'convert');
    workflow = new DocumentWorkflow(() => 'en-US', {
      pdfConverter: converter,
    });
    value(await select());
    const records = [{ name: 'Alice' }, { name: 'Bob' }];
    const selectedPreview = value(await workflow.previewPdf(records, 1));
    expect(readPdfText(selectedPreview.bytes)).toContain('Bob');
    expect(readPdfText(selectedPreview.bytes)).not.toContain('Alice');
    expect(await readdir(root)).toEqual(['template.docx']);
    vi.setSystemTime(new Date('2026-01-01T12:01:00Z'));
    const allPreview = value(await workflow.previewPdf(records, 'all'));
    expect(allPreview.id).not.toBe(selectedPreview.id);
    const allText = readPdfText(allPreview.bytes);
    expect(allText.indexOf('Alice')).toBeLessThan(allText.indexOf('Bob'));
    vi.setSystemTime(new Date('2026-01-01T12:02:00Z'));
    value(await workflow.invalidateOutput(true));
    const planned = value(
      await workflow.previewOutput(records, {
        mode: 'directory',
        documentFormat: 'pdf',
        mergedPdf: 'merged.pdf',
        destination: path.join(root, 'out'),
        pathTemplate: '{name}.pdf',
      }),
    );
    value(await workflow.generate(window, planned.id));
    expect(convert).toHaveBeenCalledTimes(2);
    expect(await readdir(path.join(root, 'out'))).toEqual(['Alice.pdf', 'Bob.pdf', 'merged.pdf']);
    expect(readPdfText(await readFile(path.join(root, 'out', 'merged.pdf')))).toBe(allText);
    value(await workflow.invalidateOutput());
    const refreshed = value(await workflow.previewPdf(records, 1));
    expect(readPdfText(refreshed.bytes)).toContain('Bob');
    expect(convert).toHaveBeenCalledTimes(3);
  });

  it('publishes DOCX plus merged PDF in a ZIP and exposes only show-in-folder for it', async () => {
    const font = new Uint8Array(
      await readFile(
        new URL('../../../packages/node-output/tests/fixtures/arimo-regular.ttf', import.meta.url),
      ),
    );
    workflow = new DocumentWorkflow(() => 'en-US', {
      pdfConverter: createNodePdfConverter({
        localFonts: async (requests) => requests.map((request) => ({ ...request, bytes: font })),
      }),
    });
    value(await select());
    const destination = path.join(root, 'batch.zip');
    const planned = value(
      await workflow.previewOutput([{ name: 'Alice' }, { name: 'Bob' }], {
        mode: 'zip',
        documentFormat: 'docx',
        mergedPdf: 'merged.pdf',
        destination,
        pathTemplate: '{name}.docx',
      }),
    );
    value(await workflow.generate(window, planned.id));
    const files = readArchive(await readFile(destination));
    expect(Object.keys(files)).toEqual(['Alice.docx', 'Bob.docx', 'merged.pdf']);
    expect(readPdfText(files['merged.pdf']!)).toContain('Alice');
    value(await workflow.openOutput());
    expect(mocks.show).toHaveBeenCalledWith(destination);
    expect(await workflow.openOutputFile()).toMatchObject({ status: 'error' });
  });

  it('offers both file operations for a single PDF', async () => {
    const font = new Uint8Array(
      await readFile(
        new URL('../../../packages/node-output/tests/fixtures/arimo-regular.ttf', import.meta.url),
      ),
    );
    workflow = new DocumentWorkflow(() => 'en-US', {
      pdfConverter: createNodePdfConverter({
        localFonts: async (requests) => requests.map((request) => ({ ...request, bytes: font })),
      }),
    });
    value(await select());
    const destination = path.join(root, 'single.pdf');
    const planned = value(
      await workflow.previewOutput([{ name: 'Alice' }], {
        mode: 'single',
        documentFormat: 'pdf',
        destination,
        pathTemplate: '{name}.pdf',
      }),
    );
    value(await workflow.generate(window, planned.id));
    mocks.openPath.mockResolvedValueOnce('');
    value(await workflow.openOutputFile());
    value(await workflow.openOutput());
    expect(mocks.openPath).toHaveBeenCalledWith(destination);
    expect(mocks.show).toHaveBeenCalledWith(destination);
  });

  it('uses the selected language for native dialogs without changing template field names', async () => {
    workflow = new DocumentWorkflow(() => 'en-US');
    const selected = value(await select());
    expect(selected.definition.fields[0]?.name).toBe('name');
    expect(mocks.open).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ title: 'Select DOCX template' }),
    );
    mocks.save.mockResolvedValueOnce({ canceled: true, filePath: '' });
    await workflow.exportExcel(window);
    expect(mocks.save).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ title: 'Save Excel input template' }),
    );
  });
  it('confirms all directory replacements once and preserves files on cancellation or later changes', async () => {
    value(await select());
    const existing = path.join(root, 'Alice.docx');
    await writeFile(existing, 'original');
    const records = [{ name: 'Alice' }, { name: 'Bob' }];
    const cancelled = value(await plan('directory', records, root));
    expect(mocks.confirm).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    expect(await workflow.generate(window, cancelled.id)).toEqual({ status: 'cancelled' });
    expect(await readFile(existing, 'utf8')).toBe('original');
    expect(await readdir(root)).not.toContain('Bob.docx');
    const changed = value(await plan('directory', records, root));
    mocks.confirm.mockImplementationOnce(async () => {
      await writeFile(existing, 'externally changed');
      return { response: 1, checkboxChecked: false };
    });
    expect(await workflow.generate(window, changed.id)).toMatchObject({
      status: 'error',
      issue: { code: 'OutputChangedAfterPreflight' },
    });
    expect(await readFile(existing, 'utf8')).toBe('externally changed');
    const accepted = value(await plan('directory', records, root));
    mocks.confirm.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    expect(value(await workflow.generate(window, accepted.id))).toMatchObject({
      documentCount: 2,
      replacedCount: 1,
    });
    expect(mocks.confirm).toHaveBeenLastCalledWith(
      window,
      expect.objectContaining({ message: '将覆盖 1 个同名文件，是否继续？' }),
    );
  });
  it('scopes native save consent to the selected path and rejects changes before preview', async () => {
    value(await select());
    const destination = path.join(root, 'confirmed.docx');
    const other = path.join(root, 'other.docx');
    await writeFile(destination, 'old');
    await writeFile(other, 'unconfirmed');
    mocks.save.mockResolvedValueOnce({ canceled: false, filePath: destination });
    value(await workflow.selectOutput(window, 'single'));
    expect(await plan('single', [{ name: 'A' }], other)).toMatchObject({
      status: 'error',
      issue: { code: 'OutputConflict' },
    });
    await writeFile(destination, 'changed since confirmation');
    expect(await plan('single', [{ name: 'A' }], destination)).toMatchObject({
      status: 'error',
      issue: { code: 'OutputChangedAfterPreflight' },
    });
    expect(await readFile(destination, 'utf8')).toBe('changed since confirmation');
  });
  it('opens only the last successfully exported template and clears it on replacement', async () => {
    value(await select());
    const destination = path.join(root, 'input.xlsx');
    await writeFile(destination, 'old');
    mocks.save.mockResolvedValueOnce({ canceled: false, filePath: destination });
    value(await workflow.exportExcel(window));
    mocks.openPath.mockResolvedValueOnce('');
    value(await workflow.openExcelTemplate());
    expect(mocks.openPath).toHaveBeenLastCalledWith(destination);
    mocks.save.mockResolvedValueOnce({ canceled: true, filePath: '' });
    expect(await workflow.exportExcel(window)).toEqual({ status: 'cancelled' });
    mocks.openPath.mockResolvedValueOnce('Application not found');
    expect(await workflow.openExcelTemplate()).toMatchObject({
      status: 'error',
      issue: { code: 'OpenFileFailed' },
    });
    value(await select());
    expect(await workflow.openExcelTemplate()).toMatchObject({
      status: 'error',
      issue: { code: 'NoExportedTemplate' },
    });
  });
  it('preserves publication rollback warnings without claiming a saved count', async () => {
    value(await select());
    const destination = path.join(root, 'failed.docx');
    const preview = value(await plan('single', [{ name: 'Alice' }], destination));
    vi.mocked(publishArtifacts).mockResolvedValueOnce({
      ok: false,
      errors: [{ code: 'OutputWriteFailed', path: destination, phase: 'replace' }],
      warnings: [{ code: 'RollbackFailed', path: destination, systemCode: 'EACCES' }],
    });
    expect(await workflow.generate(window, preview.id)).toMatchObject({
      status: 'error',
      issue: { stage: 'publication', code: 'OutputWriteFailed' },
      warnings: [{ code: 'RollbackFailed', data: { path: destination, systemCode: 'EACCES' } }],
    });
    expect(await workflow.openOutput()).toMatchObject({
      status: 'error',
      issue: { code: 'NoPublishedOutput' },
    });
  });
  it('renders a manual collection and only publishes after explicit generation', async () => {
    value(await select(createDocx([['{name}'], ['{#items}'], ['{label}'], ['{/items}']])));
    const destination = path.join(root, 'filled.docx');
    const preview = value(
      await plan('single', [{ name: 'Alice', items: [{ label: 'Desk' }] }], destination),
    );
    expect(await readdir(root)).toEqual(['template.docx']);
    const result = value(await workflow.generate(window, preview.id));
    expect(result.documentCount).toBe(1);
    expect(readArchive(await readFile(destination))['word/document.xml']!.toString()).toContain(
      'Desk',
    );
    value(await workflow.openOutput());
    expect(mocks.show).toHaveBeenCalledWith(destination);
    expect(await workflow.generate(window, preview.id)).toMatchObject({
      status: 'error',
      issue: { code: 'StaleOutputPlan' },
    });
  });
  it('imports reordered CSV fields, replaces batches and generates directory documents', async () => {
    value(await select(createDocx([['{name}'], ['{code}']])));
    const input = path.join(root, 'records.csv');
    await writeFile(input, 'code,name\n001234,Alice\n009876,Bob\n');
    mocks.open.mockResolvedValueOnce({ canceled: false, filePaths: [input] });
    const imported = value(await workflow.importRecords(window, { encoding: 'utf8' }, false));
    expect(imported.records[0]).toEqual({ name: 'Alice', code: '001234' });
    const destination = path.join(root, 'output');
    const preview = value(await plan('directory', null, destination));
    expect(value(await workflow.generate(window, preview.id)).documentCount).toBe(2);
    expect(await readdir(destination)).toEqual(['Alice.docx', 'Bob.docx']);
    await writeFile(input, 'code,name\n007,Carol\n');
    expect(
      value(await workflow.importRecords(window, { encoding: 'utf8' }, true)).records,
    ).toHaveLength(1);
    await writeFile(input, 'wrong\nvalue\n');
    expect(await workflow.importRecords(window, { encoding: 'utf8' }, true)).toMatchObject({
      status: 'error',
    });
    expect(await workflow.validateRecords(null)).toMatchObject({
      status: 'error',
      issue: { code: 'NoInputRecords' },
    });
  });
  it('joins multiple XLSX collections, preserves source diagnostics and writes ZIP entries in plan order', async () => {
    value(
      await select(
        createDocx([
          ['{name}'],
          ['{#items}'],
          ['{label}'],
          ['{/items}'],
          ['{#payments}'],
          ['{amount:number}'],
          ['{/payments}'],
        ]),
      ),
    );
    const input = path.join(root, 'records.xlsx');
    const sheets = {
      Records: [
        ['name', '__templify_id'],
        ['Alice', 'a'],
        ['Bob', 'b'],
      ],
      items: [
        ['label', '__templify_parent_id'],
        ['Desk', 'b'],
        ['Chair', 'a'],
      ],
      payments: [
        ['amount', '__templify_parent_id'],
        [12, 'a'],
      ],
    };
    await writeFile(input, await createXlsx(sheets));
    mocks.open.mockResolvedValueOnce({ canceled: false, filePaths: [input] });
    const imported = value(await workflow.importRecords(window, { encoding: 'utf8' }, false));
    expect(imported.source.sheets).toEqual(['Records', 'items', 'payments']);
    expect(imported.records).toMatchObject([
      { name: 'Alice', items: [{ label: 'Chair' }], payments: [{ amount: 12 }] },
      { name: 'Bob', items: [{ label: 'Desk' }], payments: [] },
    ]);
    const destination = path.join(root, 'documents.zip');
    const preview = value(await plan('zip', null, destination));
    value(await workflow.generate(window, preview.id));
    const entries = readArchive(await readFile(destination));
    expect(Object.keys(entries)).toEqual(['Alice.docx', 'Bob.docx']);
    expect(readArchive(entries['Alice.docx']!)['word/document.xml']!.toString()).toContain('Chair');
    await writeFile(
      input,
      await createXlsx({
        ...sheets,
        payments: [
          ['amount', '__templify_parent_id'],
          ['bad', 'a'],
        ],
      }),
    );
    expect(await workflow.importRecords(window, { encoding: 'utf8' }, true)).toMatchObject({
      status: 'error',
      issue: {
        code: 'InvalidInputValue',
        data: {
          location: {
            sheetName: 'payments',
            sourceRowNumber: 2,
            sourceColumnNumber: 1,
            path: ['payments', 0, 'amount'],
          },
        },
      },
    });
  });
  it('preserves cancelled selection, clears failed template replacement and rejects overlapping actions', async () => {
    value(await select());
    mocks.open.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await workflow.selectTemplate(window)).toEqual({ status: 'cancelled' });
    expect(value(await workflow.validateRecords([{ name: 'Alice' }]))).toBe(1);
    const deferred = Promise.withResolvers<{ canceled: boolean; filePaths: string[] }>();
    mocks.open.mockReturnValueOnce(deferred.promise);
    const pending = workflow.selectTemplate(window);
    expect(await workflow.reset()).toMatchObject({ status: 'error', issue: { code: 'Busy' } });
    await writeFile(templatePath, 'not docx');
    deferred.resolve({ canceled: false, filePaths: [templatePath] });
    expect(await pending).toMatchObject({ status: 'error' });
    expect(await workflow.validateRecords([{ name: 'Alice' }])).toMatchObject({
      status: 'error',
      issue: { code: 'NoTemplateSelected' },
    });
  });
  it('enforces single-record output, source protection, conflicts and stale previews', async () => {
    value(await select());
    expect(
      await plan('single', [{ name: 'A' }, { name: 'B' }], path.join(root, 'one.docx')),
    ).toMatchObject({ status: 'error' });
    expect(await plan('single', [{ name: 'A' }], templatePath, true)).toMatchObject({
      status: 'error',
    });
    const destination = path.join(root, 'one.docx');
    const preview = value(await plan('single', [{ name: 'A' }], destination));
    await writeFile(destination, 'existing');
    expect(await workflow.generate(window, preview.id)).toMatchObject({
      status: 'error',
      issue: { stage: 'preflight', code: 'OutputConflict' },
    });
    expect(await readFile(destination, 'utf8')).toBe('existing');
    const next = value(await plan('single', [{ name: 'A' }], destination, true));
    value(await workflow.invalidateOutput());
    expect(await workflow.generate(window, next.id)).toMatchObject({
      status: 'error',
      issue: { code: 'StaleOutputPlan' },
    });
    const overwritten = value(await plan('single', [{ name: 'B' }], destination, true));
    expect(value(await workflow.generate(window, overwritten.id)).replacedCount).toBe(1);
  });
  it('exports the existing Excel template protocol without requiring records', async () => {
    value(await select(createDocx([['{name}'], ['{#items}'], ['{label}'], ['{/items}']])));
    const destination = path.join(root, 'input.xlsx');
    mocks.save.mockResolvedValueOnce({ canceled: false, filePath: destination });
    expect(value(await workflow.exportExcel(window))).toBe(destination);
    expect(Object.keys(readArchive(await readFile(destination)))).toContain('xl/workbook.xml');
  });
});
