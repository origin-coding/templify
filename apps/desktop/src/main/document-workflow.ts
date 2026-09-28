import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import {
  derivePublicationManifest,
  generateArtifacts,
  packageArtifacts,
  prepareGeneration,
  prepareTemplate,
  type PreparedTemplate,
} from '@templify/core';
import {
  createPublicationPlan,
  preflightPublication,
  publishArtifacts,
} from '@templify/node-output';
import type {
  DesktopIssue,
  DesktopResult,
  GeneratedDocument,
  InspectedTemplate,
} from '../shared/desktop-api';

interface TemplateSelection {
  readonly path: string;
  readonly prepared: PreparedTemplate;
}

let selectedTemplate: TemplateSelection | undefined;
let busy = false;

export async function selectTemplate(
  window: BrowserWindow,
): Promise<DesktopResult<InspectedTemplate>> {
  if (busy) return error({ stage: 'desktop', code: 'Busy', details: '' });
  const selection = await dialog.showOpenDialog(window, {
    title: 'Choose a DOCX template',
    properties: ['openFile'],
    filters: [{ name: 'Word documents', extensions: ['docx'] }],
  });
  if (selection.canceled || selection.filePaths.length === 0) return { status: 'cancelled' };
  const templatePath = selection.filePaths[0]!;
  try {
    const prepared = prepareTemplate(await readFile(templatePath));
    if (!prepared.ok) return stageError('template', prepared.errors[0]);
    selectedTemplate = { path: templatePath, prepared: prepared.value };
    return {
      status: 'ok',
      value: { path: templatePath, definition: prepared.value.definition },
    };
  } catch (cause) {
    return systemError('template', 'TemplateReadFailed', cause);
  }
}

export async function generateDocument(
  window: BrowserWindow,
  record: Readonly<Record<string, unknown>>,
  overwrite: boolean,
): Promise<DesktopResult<GeneratedDocument>> {
  if (busy) return error({ stage: 'desktop', code: 'Busy', details: '' });
  if (!selectedTemplate)
    return error({ stage: 'desktop', code: 'NoTemplateSelected', details: '' });
  if (
    typeof record !== 'object' ||
    record === null ||
    Array.isArray(record) ||
    typeof overwrite !== 'boolean'
  )
    return error({ stage: 'desktop', code: 'InvalidRequest', details: '' });
  busy = true;
  try {
    const template = selectedTemplate;
    const output = await dialog.showSaveDialog(window, {
      title: 'Save generated DOCX',
      defaultPath: path.join(
        path.dirname(template.path),
        `${path.parse(template.path).name}-filled.docx`,
      ),
      filters: [{ name: 'Word documents', extensions: ['docx'] }],
    });
    if (output.canceled || !output.filePath) return { status: 'cancelled' };
    const outputPath = path.resolve(output.filePath);
    if (path.extname(outputPath).toLowerCase() !== '.docx')
      return error({ stage: 'desktop', code: 'InvalidOutputExtension', details: outputPath });

    const generation = prepareGeneration({
      template: template.prepared,
      input: { kind: 'object-rows', rows: [record] },
      request: {
        naming: { kind: 'single', fileName: path.basename(outputPath) },
        documentOutputs: 'docx',
      },
    });
    if (!generation.ok) return stageError(generation.errors[0].stage, generation.errors[0].issue);

    const plan = createPublicationPlan({
      manifest: derivePublicationManifest(generation.value.plan),
      rootDirectory: path.dirname(outputPath),
      conflictPolicy: overwrite ? 'overwrite' : 'error',
      protectedPaths: [template.path],
    });
    if (!plan.ok) return stageError('publication-plan', plan.errors[0]);
    const preflighted = await preflightPublication(plan.value);
    if (!preflighted.ok) return stageError('preflight', preflighted.errors[0]);

    const generated = await generateArtifacts(generation.value);
    if (!generated.ok) return stageError('generation', generated.errors[0]);
    const packaged = packageArtifacts(generation.value.plan, generated.value);
    if (!packaged.ok) return stageError('packaging', packaged.errors[0]);
    const published = await publishArtifacts(preflighted.value, packaged.value);
    if (!published.ok) return stageError('publication', published.errors[0]);
    const result = published.value.artifacts[0];
    if (!result)
      return error({ stage: 'publication', code: 'MissingPublishedArtifact', details: '' });
    return {
      status: 'ok',
      value: { path: result.path, replacedExisting: result.replacedExisting },
    };
  } catch (cause) {
    return systemError('desktop', 'UnexpectedFailure', cause);
  } finally {
    busy = false;
  }
}

function stageError<T>(stage: string, issue: T): DesktopResult<never> {
  const value = issue as { readonly code: string };
  return error({
    stage,
    code: value.code,
    details: JSON.stringify(issue),
  });
}

function systemError(stage: string, code: string, cause: unknown): DesktopResult<never> {
  return error({
    stage,
    code,
    details: cause instanceof Error ? cause.message : String(cause),
  });
}

function error(issue: DesktopIssue): DesktopResult<never> {
  return { status: 'error', issue };
}
