import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { en, zh, type MessageKey } from '../shared/messages';
import type { AppLocale } from '../shared/settings';
import { dialog, shell, type BrowserWindow } from 'electron';
import {
  derivePublicationManifest,
  deriveUnbundledManifestItems,
  generateArtifacts,
  normalizeRecords,
  packageArtifacts,
  prepareGeneration,
  prepareTemplate,
  type Generation,
  type PreparedTemplate,
  type RawInputBatch,
  type StageResult,
  type PdfConverter,
  type PdfConversionResult,
} from '@templify/core';
import {
  createPublicationPlan,
  preflightPublication,
  publishArtifacts,
  type PreflightedPublication,
  createNodePdfConverter,
} from '@templify/node-output';
import {
  createXlsxTemplate,
  listXlsxSheets,
  parseCsvInput,
  parseXlsxInput,
  validateScalarTabularTemplate,
} from '@templify/tabular-input';
import type {
  DesktopIssue,
  DesktopResult,
  GeneratedDocuments,
  ImportedRecords,
  ImportOptions,
  InputSource,
  InspectedTemplate,
  OutputMode,
  OutputPreview,
  OutputSettings,
  PdfPreview,
} from '../shared/desktop-api';

class WorkflowFailure extends Error {
  readonly issues: readonly DesktopIssue[];
  constructor(issues: readonly DesktopIssue[]) {
    super(issues[0]?.code);
    this.issues = issues;
  }
}
export function diagnostic(stage: string, issue: unknown): DesktopIssue {
  const data =
    typeof issue === 'object' && issue !== null
      ? (issue as Record<string, unknown>)
      : { reason: String(issue) };
  return {
    stage,
    code: typeof data.code === 'string' ? data.code : 'UnexpectedFailure',
    details: JSON.stringify(data),
    data,
  };
}

/** One in-memory task; prepared templates and raw file input stay in the main process. */
export class DocumentWorkflow {
  private readonly locale: () => AppLocale;
  private readonly converter: PdfConverter;
  private readonly pdfCache = new Map<string, PdfConversionResult>();
  constructor(
    locale: () => AppLocale = () => 'zh-CN',
    dependencies: { pdfConverter?: PdfConverter } = {},
  ) {
    this.locale = locale;
    this.converter = dependencies.pdfConverter ?? createNodePdfConverter();
  }
  private text(key: MessageKey, values: Record<string, string | number> = {}): string {
    const message = (this.locale() === 'zh-CN' ? zh : en)[key];
    return message.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
  }
  private template: { path: string; prepared: PreparedTemplate } | undefined;
  private input: RawInputBatch | undefined;
  private source: InputSource | undefined;
  private preview:
    | {
        id: number;
        generation: Generation;
        publication: PreflightedPublication;
        settings: OutputSettings;
      }
    | undefined;
  private completed: OutputSettings | undefined;
  private exportedTemplate: string | undefined;
  private selectedOutput: { path: string; mode: OutputMode; fingerprint: string } | undefined;
  private sequence = 0;
  private busy = false;

  private async run<T>(
    operation: (warnings: DesktopIssue[]) => Promise<T | undefined>,
  ): Promise<DesktopResult<T>> {
    if (this.busy) return this.failure([diagnostic('desktop', { code: 'Busy' })], []);
    this.busy = true;
    const warnings: DesktopIssue[] = [];
    try {
      const value = await operation(warnings);
      return value === undefined ? { status: 'cancelled' } : { status: 'ok', value, warnings };
    } catch (cause) {
      return this.failure(
        cause instanceof WorkflowFailure
          ? cause.issues
          : [
              diagnostic('desktop', {
                code: 'UnexpectedFailure',
                reason: cause instanceof Error ? cause.message : String(cause),
              }),
            ],
        warnings,
      );
    } finally {
      this.busy = false;
    }
  }
  private failure(
    issues: readonly DesktopIssue[],
    warnings: readonly DesktopIssue[],
  ): DesktopResult<never> {
    return {
      status: 'error',
      issue: issues[0]!,
      issues,
      warnings,
      ...(this.source ? { source: this.source } : {}),
    };
  }
  private requireTemplate() {
    if (!this.template)
      throw new WorkflowFailure([diagnostic('desktop', { code: 'NoTemplateSelected' })]);
    return this.template;
  }
  private batch(records: readonly Readonly<Record<string, unknown>>[] | null): RawInputBatch {
    if (records === null) {
      if (!this.input) throw new WorkflowFailure([diagnostic('input', { code: 'NoInputRecords' })]);
      return this.input;
    }
    if (!Array.isArray(records))
      throw new WorkflowFailure([diagnostic('desktop', { code: 'InvalidRequest' })]);
    return { kind: 'object-rows', rows: records };
  }
  private clearOutput(clearPdf = true) {
    this.preview = undefined;
    this.completed = undefined;
    if (clearPdf) {
      this.pdfCache.clear();
    }
  }
  private clearInput() {
    this.input = undefined;
    this.source = undefined;
    this.clearOutput();
  }

  selectTemplate(window: BrowserWindow): Promise<DesktopResult<InspectedTemplate>> {
    return this.run(async (warnings) => {
      const selection = await dialog.showOpenDialog(window, {
        title: this.text('selectDocxTitle'),
        properties: ['openFile'],
        filters: [{ name: 'Word', extensions: ['docx'] }],
      });
      if (selection.canceled || !selection.filePaths[0]) return;
      this.template = undefined;
      this.exportedTemplate = undefined;
      this.selectedOutput = undefined;
      this.clearInput();
      const templatePath = selection.filePaths[0];
      const prepared = requireStage(
        'template',
        prepareTemplate(await readSourceFile(templatePath, 'template')),
        warnings,
      );
      this.template = { path: templatePath, prepared };
      return { path: templatePath, definition: prepared.definition };
    });
  }
  importRecords(
    window: BrowserWindow,
    options: ImportOptions,
    reuse: boolean,
  ): Promise<DesktopResult<ImportedRecords>> {
    return this.run(async (warnings) => {
      const template = this.requireTemplate();
      if (
        !options ||
        !['utf8', 'gbk'].includes(options.encoding) ||
        (options.sheet !== undefined && typeof options.sheet !== 'string') ||
        typeof reuse !== 'boolean'
      )
        throw new WorkflowFailure([diagnostic('desktop', { code: 'InvalidRequest' })]);
      let inputPath = reuse ? this.source?.path : undefined;
      if (reuse && !inputPath)
        throw new WorkflowFailure([diagnostic('input', { code: 'NoInputSelected' })]);
      if (!reuse) {
        const selected = await dialog.showOpenDialog(window, {
          title: this.text('importFile'),
          properties: ['openFile'],
          filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }],
        });
        if (selected.canceled || !selected.filePaths[0]) return;
        inputPath = selected.filePaths[0];
      }
      this.input = undefined;
      this.clearOutput();
      const format = path.extname(inputPath!).toLowerCase() === '.xlsx' ? 'xlsx' : 'csv';
      this.source = { path: inputPath!, format, sheets: [], encoding: options.encoding };
      if (!['.xlsx', '.csv'].includes(path.extname(inputPath!).toLowerCase()))
        throw new WorkflowFailure([diagnostic('input', { code: 'UnsupportedInput' })]);
      const bytes = await readSourceFile(inputPath!, 'input');
      if (format === 'xlsx') {
        let sheets: readonly string[];
        try {
          sheets = await listXlsxSheets(bytes);
        } catch (cause) {
          throw new WorkflowFailure([
            diagnostic('input', { code: 'InvalidXlsx', reason: String(cause) }),
          ]);
        }
        const sheet = options.sheet ?? sheets[0];
        this.source = { ...this.source, sheets, ...(sheet === undefined ? {} : { sheet }) };
      } else
        requireStage(
          'input',
          validateScalarTabularTemplate(template.prepared.definition),
          warnings,
        );
      const raw =
        format === 'xlsx'
          ? requireStage(
              'input',
              await parseXlsxInput(
                bytes,
                template.prepared.definition,
                this.source.sheet === undefined ? {} : { sheet: this.source.sheet },
              ),
              warnings,
            )
          : requireStage('input', parseCsvInput(bytes, { encoding: options.encoding }), warnings);
      const normalized = requireStage(
        'input',
        normalizeRecords(template.prepared.definition, raw),
        warnings,
      );
      this.input = raw;
      return { source: this.source, records: normalized.records, origins: normalized.origins };
    });
  }
  exportExcel(window: BrowserWindow): Promise<DesktopResult<string>> {
    return this.run(async (warnings) => {
      const template = this.requireTemplate();
      const output = await dialog.showSaveDialog(window, {
        title: this.text('saveExcelTitle'),
        properties: ['showOverwriteConfirmation'],
        defaultPath: path.join(
          path.dirname(template.path),
          `${path.parse(template.path).name}-input.xlsx`,
        ),
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (output.canceled || !output.filePath) return;
      requireExtension(output.filePath, '.xlsx');
      const confirmedFingerprint = await targetFingerprint(output.filePath);
      // Capture the target immediately after the native save confirmation.
      const artifactId = 'excel-template';
      const relativePath = path.basename(output.filePath);
      const publication = requireStage(
        'excel-template',
        createPublicationPlan({
          manifest: { version: 1, items: [{ artifactId, kind: 'file', relativePath }] },
          rootDirectory: path.dirname(output.filePath),
          conflictPolicy: 'overwrite',
          protectedPaths: this.protectedPaths(),
        }),
        warnings,
      );
      const preflighted = requireStage(
        'excel-template',
        await preflightPublication(publication),
        warnings,
      );
      if (confirmedFingerprint !== (await targetFingerprint(output.filePath)))
        throw new WorkflowFailure([
          diagnostic('excel-template', {
            code: 'OutputChangedAfterPreflight',
            path: output.filePath,
          }),
        ]);
      const bytes = requireStage(
        'excel-template',
        await createXlsxTemplate(template.prepared.definition),
        warnings,
      );
      requireStage(
        'excel-template',
        await publishArtifacts(preflighted, {
          artifacts: [{ artifactId, kind: 'file', relativePath, bytes }],
        }),
        warnings,
      );
      this.exportedTemplate = output.filePath;
      return output.filePath;
    });
  }
  validateRecords(
    records: readonly Readonly<Record<string, unknown>>[] | null,
  ): Promise<DesktopResult<number>> {
    return this.run(async (warnings) => {
      this.preview = undefined;
      return requireStage(
        'input',
        normalizeRecords(this.requireTemplate().prepared.definition, this.batch(records)),
        warnings,
      ).records.length;
    });
  }
  selectOutput(
    window: BrowserWindow,
    mode: OutputMode,
    format: 'docx' | 'pdf' = 'docx',
  ): Promise<DesktopResult<string>> {
    return this.run(async () => {
      this.requireTemplate();
      requireMode(mode);
      requireFormat(format);
      if (mode === 'directory') {
        const result = await dialog.showOpenDialog(window, {
          title: this.text('outputDirectoryTitle'),
          properties: ['openDirectory', 'createDirectory'],
        });
        return result.canceled ? undefined : result.filePaths[0];
      }
      const extension = mode === 'zip' ? '.zip' : `.${format}`;
      const result = await dialog.showSaveDialog(window, {
        title: this.text('outputTitle'),
        properties: ['showOverwriteConfirmation'],
        defaultPath: `documents${extension}`,
        filters: [
          {
            name: mode === 'zip' ? 'ZIP' : format === 'pdf' ? 'PDF' : 'Word',
            extensions: [extension.slice(1)],
          },
        ],
      });
      if (result.canceled || !result.filePath) return;
      requireExtension(result.filePath, extension);
      const destination = path.resolve(result.filePath);
      this.selectedOutput = {
        path: destination,
        mode,
        fingerprint: await targetFingerprint(destination),
      };
      return destination;
    });
  }
  previewOutput(
    records: readonly Readonly<Record<string, unknown>>[] | null,
    settings: OutputSettings,
  ): Promise<DesktopResult<OutputPreview>> {
    return this.run(async (warnings) => {
      this.clearOutput(false);
      const template = this.requireTemplate();
      if (
        !settings ||
        typeof settings.destination !== 'string' ||
        !path.isAbsolute(settings.destination) ||
        typeof settings.pathTemplate !== 'string'
      )
        throw new WorkflowFailure([diagnostic('desktop', { code: 'InvalidRequest' })]);
      requireMode(settings.mode);
      const format = settings.documentFormat ?? 'docx';
      requireFormat(format);
      const extension = `.${format}`;
      if (
        settings.mergedPdf !== undefined &&
        (settings.mode === 'single' || typeof settings.mergedPdf !== 'string')
      )
        throw new WorkflowFailure([diagnostic('desktop', { code: 'InvalidRequest' })]);
      const selection = this.selectedOutput;
      const nativeConsent =
        settings.mode !== 'directory' &&
        selection?.mode === settings.mode &&
        selection.path === path.resolve(settings.destination);
      if (
        nativeConsent &&
        selection.fingerprint !== (await targetFingerprint(settings.destination))
      )
        throw new WorkflowFailure([
          diagnostic('preflight', {
            code: 'OutputChangedAfterPreflight',
            path: settings.destination,
          }),
        ]);
      if (settings.mode !== 'directory')
        requireExtension(settings.destination, settings.mode === 'zip' ? '.zip' : extension);
      let pathTemplate = settings.pathTemplate;
      if (!path.posix.extname(pathTemplate)) pathTemplate += extension;
      if (settings.mode !== 'single') requireExtension(pathTemplate, extension);
      const prepared = prepareGeneration({
        template: template.prepared,
        input: this.batch(records),
        request: {
          documentOutputs: format,
          ...(settings.mergedPdf === undefined
            ? {}
            : { aggregates: [{ kind: 'merged-pdf' as const, relativePath: settings.mergedPdf }] }),
          naming:
            settings.mode === 'single'
              ? { kind: 'single', fileName: path.basename(settings.destination) }
              : { kind: 'template', pathTemplate },
          ...(settings.mode === 'zip'
            ? { bundle: { kind: 'zip' as const, fileName: path.basename(settings.destination) } }
            : {}),
        },
      });
      warnings.push(
        ...prepared.warnings.map((warning) => diagnostic(warning.stage, warning.issue)),
      );
      if (!prepared.ok)
        throw new WorkflowFailure(
          prepared.errors.map((error) => diagnostic(error.stage, error.issue)),
        );
      const generation = prepared.value;
      const publication = requireStage(
        'publication-plan',
        createPublicationPlan({
          manifest: derivePublicationManifest(generation.plan),
          rootDirectory:
            settings.mode === 'directory'
              ? settings.destination
              : path.dirname(settings.destination),
          conflictPolicy: settings.mode === 'directory' || nativeConsent ? 'overwrite' : 'error',
          protectedPaths: this.protectedPaths(),
        }),
        warnings,
      );
      const preflighted = requireStage(
        'preflight',
        await preflightPublication(publication),
        warnings,
      );
      if (
        nativeConsent &&
        selection.fingerprint !== (await targetFingerprint(settings.destination))
      )
        throw new WorkflowFailure([
          diagnostic('preflight', {
            code: 'OutputChangedAfterPreflight',
            path: settings.destination,
          }),
        ]);
      const id = ++this.sequence;
      this.preview = { id, generation, publication: preflighted, settings: { ...settings } };
      return {
        id,
        documentCount: generation.plan.documents.length,
        destination: settings.destination,
        mode: settings.mode,
        paths: deriveUnbundledManifestItems(generation.plan).map((item) => item.relativePath),
      };
    });
  }
  generate(window: BrowserWindow, previewId: number): Promise<DesktopResult<GeneratedDocuments>> {
    return this.run(async (warnings) => {
      const preview = this.preview;
      if (!preview || previewId !== preview.id)
        throw new WorkflowFailure([diagnostic('desktop', { code: 'StaleOutputPlan' })]);
      this.preview = undefined;
      const phase = (value: string) => {
        if (!window.isDestroyed()) window.webContents.send('templify:phase', value);
      };
      phase(this.text('checkOutput'));
      // Recheck access and source protection without replacing the consent-bound snapshot.
      requireStage('preflight', await preflightPublication(preview.publication.plan), warnings);
      const replacements = preview.publication.items.filter(
        (item) => item.action === 'replace',
      ).length;
      if (preview.settings.mode === 'directory' && replacements > 0) {
        const confirmation = await dialog.showMessageBox(window, {
          type: 'warning',
          title: this.text('confirmOverwrite'),
          message: this.text('overwriteMessage', { count: replacements }),
          detail: this.text('overwriteDirectory', { path: preview.settings.destination }),
          buttons: [this.text('cancel'), this.text('overwriteGenerate')],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (confirmation.response !== 1) return;
      }
      phase(this.text('renderDocx'));
      const generated = requireStage(
        'generation',
        await generateArtifacts(preview.generation, { pdfConverter: this.cachedConverter() }),
        warnings,
      );
      phase(this.text('packageDocs'));
      const packaged = requireStage(
        'packaging',
        packageArtifacts(preview.generation.plan, generated),
        warnings,
      );
      phase(this.text('saveDocs'));
      const published = requireStage(
        'publication',
        await publishArtifacts(preview.publication, packaged),
        warnings,
      );
      this.completed = preview.settings;
      return {
        documentCount: preview.generation.plan.documents.length,
        paths: published.artifacts.map((artifact) => artifact.path),
        replacedCount: published.artifacts.filter((artifact) => artifact.replacedExisting).length,
      };
    });
  }
  openOutput(): Promise<DesktopResult<boolean>> {
    return this.run(async () => {
      if (!this.completed)
        throw new WorkflowFailure([diagnostic('desktop', { code: 'NoPublishedOutput' })]);
      if (this.completed.mode === 'directory') {
        const error = await shell.openPath(this.completed.destination);
        if (error) throw new Error(error);
      } else shell.showItemInFolder(this.completed.destination);
      return true;
    });
  }
  openOutputFile(): Promise<DesktopResult<boolean>> {
    return this.run(async () => {
      if (!this.completed || this.completed.mode !== 'single')
        throw new WorkflowFailure([diagnostic('desktop', { code: 'NoPublishedOutput' })]);
      const error = await shell.openPath(this.completed.destination);
      if (error)
        throw new WorkflowFailure([
          diagnostic('desktop', {
            code: 'OpenFileFailed',
            path: this.completed.destination,
            reason: error,
          }),
        ]);
      return true;
    });
  }
  previewPdf(
    records: readonly Readonly<Record<string, unknown>>[] | null,
    selection: number | 'all',
  ): Promise<DesktopResult<PdfPreview>> {
    return this.run(async (warnings) => {
      const template = this.requireTemplate();
      const batch = requireStage(
        'input',
        normalizeRecords(template.prepared.definition, this.batch(records)),
        warnings,
      );
      if (
        selection !== 'all' &&
        (!Number.isInteger(selection) || selection < 0 || selection >= batch.records.length)
      )
        throw new WorkflowFailure([diagnostic('desktop', { code: 'InvalidRequest' })]);
      const prepared = prepareGeneration({
        template: template.prepared,
        input: {
          kind: 'object-rows',
          rows: selection === 'all' ? batch.records : [batch.records[selection]!],
        },
        request: {
          documentOutputs: 'pdf',
          naming: { kind: 'template', pathTemplate: 'preview-{$index}.pdf' },
          ...(selection === 'all'
            ? { aggregates: [{ kind: 'merged-pdf' as const, relativePath: 'preview-all.pdf' }] }
            : {}),
        },
      });
      if (!prepared.ok)
        throw new WorkflowFailure(
          prepared.errors.map((error) => diagnostic(error.stage, error.issue)),
        );
      const generated = requireStage(
        'generation',
        await generateArtifacts(prepared.value, { pdfConverter: this.cachedConverter() }),
        warnings,
      );
      const artifact = generated.artifacts.find(
        (item) => item.kind === (selection === 'all' ? 'merged-pdf' : 'pdf'),
      );
      if (!artifact)
        throw new WorkflowFailure([diagnostic('pdf-preview', { code: 'PdfPreviewFailed' })]);
      return { id: ++this.sequence, bytes: artifact.bytes };
    });
  }
  private cachedConverter(): PdfConverter {
    return {
      id: this.converter.id,
      getAvailability: () => this.converter.getAvailability(),
      convert: async (docx) => {
        const key = createHash('sha256').update(docx).digest('hex');
        const cached = this.pdfCache.get(key);
        if (cached) return cached;
        const result = await this.converter.convert(docx);
        this.pdfCache.set(key, result);
        return result;
      },
    };
  }
  openExcelTemplate(): Promise<DesktopResult<boolean>> {
    return this.run(async () => {
      if (!this.exportedTemplate)
        throw new WorkflowFailure([diagnostic('desktop', { code: 'NoExportedTemplate' })]);
      const error = await shell.openPath(this.exportedTemplate);
      if (error)
        throw new WorkflowFailure([
          diagnostic('desktop', { code: 'OpenFileFailed', path: this.exportedTemplate }),
        ]);
      return true;
    });
  }
  openDocumentation(): Promise<DesktopResult<boolean>> {
    return this.run(async () => {
      await shell.openExternal('https://github.com/origin-coding/templify#readme');
      return true;
    });
  }
  resetInput(): Promise<DesktopResult<boolean>> {
    return this.run(async () => {
      this.clearInput();
      return true;
    });
  }
  invalidateOutput(preservePdf = false): Promise<DesktopResult<boolean>> {
    return this.run(async () => {
      this.clearOutput(preservePdf !== true);
      return true;
    });
  }
  reset(): Promise<DesktopResult<boolean>> {
    return this.run(async () => {
      this.template = undefined;
      this.exportedTemplate = undefined;
      this.selectedOutput = undefined;
      this.clearInput();
      return true;
    });
  }
  private protectedPaths(): string[] {
    return [this.requireTemplate().path, ...(this.source ? [this.source.path] : [])];
  }
}

async function targetFingerprint(filePath: string): Promise<string> {
  try {
    const info = await stat(filePath, { bigint: true });
    return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw cause;
  }
}

function requireStage<T, E, W>(
  stage: string,
  result: StageResult<T, E, W>,
  warnings: DesktopIssue[],
): T {
  warnings.push(...result.warnings.map((warning) => diagnostic(stage, warning)));
  if (!result.ok) throw new WorkflowFailure(result.errors.map((issue) => diagnostic(stage, issue)));
  return result.value;
}
function requireMode(mode: unknown): asserts mode is OutputMode {
  if (mode !== 'single' && mode !== 'directory' && mode !== 'zip')
    throw new WorkflowFailure([diagnostic('desktop', { code: 'InvalidRequest' })]);
}
function requireFormat(format: unknown): asserts format is 'docx' | 'pdf' {
  if (format !== 'docx' && format !== 'pdf')
    throw new WorkflowFailure([diagnostic('desktop', { code: 'InvalidRequest' })]);
}
function requireExtension(value: string, extension: string) {
  if (path.extname(value).toLowerCase() !== extension)
    throw new WorkflowFailure([
      diagnostic('desktop', { code: 'InvalidOutputExtension', path: value, extension }),
    ]);
}

async function readSourceFile(filePath: string, stage: 'template' | 'input'): Promise<Buffer> {
  try {
    return await readFile(filePath);
  } catch (cause) {
    throw new WorkflowFailure([
      diagnostic(stage, {
        code: stage === 'template' ? 'TemplateReadFailed' : 'InputReadFailed',
        path: filePath,
        reason: String(cause),
      }),
    ]);
  }
}
