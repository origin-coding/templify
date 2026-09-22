import { mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { InvalidOutputPathError, UnsafeOutputPathError } from './errors.js';
import {
  DirectoryOutputFailedError,
  type DirectoryOutputFailure,
  type GeneratedDocumentOutput,
  type RenderedPlannedDocument,
  renderPlannedDocuments,
  validateMultiDocumentPlan,
} from './multi-document-generation.js';
import { isPathContained } from './output-path.js';
import {
  preflightDocxOutputPlan,
  type DirectoryOutputPlan,
  type OutputPlanDiagnostic,
} from './plan-docx-output.js';
import type { RecordData } from './record-data.js';
import type { RenderOptions } from './render-options.js';
import { mapSystemError, writeOutputFile } from './write-single-document.js';

export interface ExecuteDirectoryDocumentGenerationInput {
  readonly template: Buffer;
  readonly records: readonly RecordData[];
  readonly sourceTemplatePath: string;
  readonly plan: DirectoryOutputPlan;
  readonly renderOptions?: RenderOptions;
}

export interface DirectoryDocumentGenerationSuccess {
  readonly ok: true;
  readonly plan: DirectoryOutputPlan;
  readonly outputs: readonly GeneratedDocumentOutput[];
}

export interface DirectoryDocumentGenerationRejected {
  readonly ok: false;
  readonly plan: DirectoryOutputPlan;
  readonly diagnostics: readonly OutputPlanDiagnostic[];
}

export type ExecuteDirectoryDocumentGenerationResult =
  | DirectoryDocumentGenerationSuccess
  | DirectoryDocumentGenerationRejected;

interface PreparedDocumentPublication {
  readonly rendered: RenderedPlannedDocument;
  readonly parentDirectory: string;
  readonly fileName: string;
}

/** Renders every record before publishing any final DOCX files. */
export async function executeDirectoryDocumentGeneration(
  input: ExecuteDirectoryDocumentGenerationInput,
): Promise<ExecuteDirectoryDocumentGenerationResult> {
  const planDiagnostics = validateMultiDocumentPlan(input.plan, 'directory', input.records.length);
  if (planDiagnostics.length > 0) {
    return { ok: false, plan: input.plan, diagnostics: planDiagnostics };
  }

  const preflight = await preflightDocxOutputPlan(input.plan, {
    sourceTemplatePath: input.sourceTemplatePath,
  });
  if (!preflight.ok) {
    return { ok: false, plan: input.plan, diagnostics: preflight.diagnostics };
  }

  const renderedDocuments = renderPlannedDocuments(
    input.template,
    input.records,
    input.plan.items,
    input.renderOptions,
  );
  const preparationResults = await Promise.allSettled(
    renderedDocuments.map((rendered) => prepareDocumentPublication(input.plan, rendered)),
  );
  const preparationFailures = collectFailures(preparationResults, renderedDocuments);
  if (preparationFailures.length > 0) {
    const firstFailure = preparationFailures[0]!;
    throw new DirectoryOutputFailedError(
      firstFailure.item,
      [],
      firstFailure.cause,
      preparationFailures,
    );
  }

  const preparedDocuments = preparationResults.map((result) =>
    result.status === 'fulfilled' ? result.value : unreachablePreparationFailure(),
  );
  const publicationResults = await Promise.allSettled(
    preparedDocuments.map(async ({ rendered, parentDirectory, fileName }) => {
      const output = await writeOutputFile(
        rendered.buffer,
        { rootDirectory: parentDirectory, fileName },
        {
          sourceTemplatePath: input.sourceTemplatePath,
          conflictPolicy: input.plan.conflictPolicy,
        },
        '.docx',
        input.plan.rootDirectory,
      );
      return {
        item: rendered.item,
        path: output.path,
        bytesWritten: output.bytesWritten,
      } satisfies GeneratedDocumentOutput;
    }),
  );
  const publicationFailures = collectFailures(publicationResults, renderedDocuments);
  const completedOutputs = publicationResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );

  if (publicationFailures.length > 0) {
    const firstFailure = publicationFailures[0]!;
    throw new DirectoryOutputFailedError(
      firstFailure.item,
      completedOutputs,
      firstFailure.cause,
      publicationFailures,
    );
  }

  return { ok: true, plan: input.plan, outputs: completedOutputs };
}

async function prepareDocumentPublication(
  plan: DirectoryOutputPlan,
  rendered: RenderedPlannedDocument,
): Promise<PreparedDocumentPublication> {
  const segments = rendered.item.relativePath.split('/');
  const parentDirectory = await ensurePlannedParentDirectory(
    plan.rootDirectory,
    segments.slice(0, -1),
  );
  return { rendered, parentDirectory, fileName: segments.at(-1)! };
}

async function ensurePlannedParentDirectory(
  rootDirectory: string,
  relativeSegments: readonly string[],
): Promise<string> {
  const normalizedRoot = path.resolve(rootDirectory);
  let realRoot: string;

  try {
    realRoot = await realpath(normalizedRoot);
  } catch (cause) {
    throw mapSystemError(cause, normalizedRoot, 'validation');
  }

  return ensureDirectorySegment(normalizedRoot, realRoot, relativeSegments, 0);
}

async function ensureDirectorySegment(
  currentDirectory: string,
  realRoot: string,
  relativeSegments: readonly string[],
  segmentIndex: number,
): Promise<string> {
  const segment = relativeSegments[segmentIndex];
  if (segment === undefined) return currentDirectory;

  const nextDirectory = path.join(currentDirectory, segment);
  try {
    await mkdir(nextDirectory);
  } catch (cause) {
    if (systemCode(cause) !== 'EEXIST') {
      throw mapSystemError(cause, nextDirectory, 'validation');
    }
  }

  let directoryStats;
  let realDirectory: string;
  try {
    [directoryStats, realDirectory] = await Promise.all([
      stat(nextDirectory),
      realpath(nextDirectory),
    ]);
  } catch (cause) {
    throw mapSystemError(cause, nextDirectory, 'validation');
  }

  if (!directoryStats.isDirectory()) {
    throw new InvalidOutputPathError('An output path parent is not a directory.', {
      path: nextDirectory,
      reason: 'RootNotDirectory',
      phase: 'validation',
    });
  }

  if (!isPathContained(realRoot, realDirectory)) {
    throw new UnsafeOutputPathError('An output path parent escapes the selected output root.', {
      path: nextDirectory,
      reason: 'OutsideOutputRoot',
      phase: 'validation',
    });
  }

  return ensureDirectorySegment(nextDirectory, realRoot, relativeSegments, segmentIndex + 1);
}

function collectFailures<T>(
  results: readonly PromiseSettledResult<T>[],
  renderedDocuments: readonly RenderedPlannedDocument[],
): readonly DirectoryOutputFailure[] {
  return results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ item: renderedDocuments[index]!.item, cause: result.reason }]
      : [],
  );
}

function unreachablePreparationFailure(): never {
  throw new Error('A rejected directory preparation result was not handled.');
}

function systemCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error as { readonly code?: unknown };
  return typeof code === 'string' ? code : undefined;
}
