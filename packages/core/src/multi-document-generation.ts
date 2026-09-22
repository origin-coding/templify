import path from 'node:path';

import { isPathContained, validateWindowsFilenameSegment } from './output-path.js';
import type {
  ArchiveOutputPlan,
  DirectoryOutputPlan,
  DocxOutputPlanItem,
  OutputPlanDiagnostic,
} from './plan-docx-output.js';
import type { RecordData } from './record-data.js';
import { renderTemplate } from './render-template.js';

export type MultiDocumentGenerationErrorCode =
  | 'BatchRenderFailed'
  | 'DirectoryOutputFailed'
  | 'ArchiveFailed';

export interface GeneratedDocumentOutput {
  readonly item: DocxOutputPlanItem;
  readonly path: string;
  readonly bytesWritten: number;
}

export interface DirectoryOutputFailure {
  readonly item: DocxOutputPlanItem;
  readonly cause: unknown;
}

export interface RenderedPlannedDocument {
  readonly item: DocxOutputPlanItem;
  readonly buffer: Buffer;
}

export class BatchRenderFailedError extends Error {
  readonly code = 'BatchRenderFailed' as const;
  readonly item: DocxOutputPlanItem;

  constructor(item: DocxOutputPlanItem, cause: unknown) {
    super(`Rendering failed for planned record ${item.recordIndex + 1}.`, { cause });
    this.name = new.target.name;
    this.item = item;
  }
}

export class DirectoryOutputFailedError extends Error {
  readonly code = 'DirectoryOutputFailed' as const;
  readonly failedItem: DocxOutputPlanItem;
  readonly completedOutputs: readonly GeneratedDocumentOutput[];
  readonly failures: readonly DirectoryOutputFailure[];

  constructor(
    failedItem: DocxOutputPlanItem,
    completedOutputs: readonly GeneratedDocumentOutput[],
    cause: unknown,
    failures: readonly DirectoryOutputFailure[] = [{ item: failedItem, cause }],
  ) {
    super(`Publishing failed for planned record ${failedItem.recordIndex + 1}.`, { cause });
    this.name = new.target.name;
    this.failedItem = failedItem;
    this.completedOutputs = [...completedOutputs];
    this.failures = [...failures];
  }
}

export class ArchiveFailedError extends Error {
  readonly code = 'ArchiveFailed' as const;
  readonly item: DocxOutputPlanItem | undefined;

  constructor(cause: unknown, item?: DocxOutputPlanItem) {
    super(
      item === undefined
        ? 'The DOCX archive could not be created.'
        : `The archive entry for planned record ${item.recordIndex + 1} could not be created.`,
      { cause },
    );
    this.name = new.target.name;
    this.item = item;
  }
}

export function renderPlannedDocuments(
  template: Buffer,
  records: readonly RecordData[],
  items: readonly DocxOutputPlanItem[],
): readonly RenderedPlannedDocument[] {
  return items.map((item) => {
    try {
      return { item, buffer: renderTemplate(template, records[item.recordIndex]!) };
    } catch (cause) {
      throw new BatchRenderFailedError(item, cause);
    }
  });
}

export function validateMultiDocumentPlan(
  plan: DirectoryOutputPlan | ArchiveOutputPlan,
  expectedMode: 'directory' | 'archive',
  recordCount: number,
): readonly OutputPlanDiagnostic[] {
  const diagnostics: OutputPlanDiagnostic[] = [];

  if (plan.mode !== expectedMode) {
    return [invalidPlan(`Expected a ${expectedMode} output plan.`)];
  }

  if (!path.isAbsolute(plan.rootDirectory)) {
    diagnostics.push(
      invalidPlan('The accepted output plan must contain an absolute output root.', {
        path: plan.rootDirectory,
      }),
    );
  }

  if (plan.conflictPolicy !== 'error' && plan.conflictPolicy !== 'overwrite') {
    diagnostics.push(invalidPlan('The accepted output plan has an invalid conflict policy.'));
  }

  if (recordCount === 0 || plan.items.length !== recordCount) {
    diagnostics.push(
      invalidPlan('The accepted output plan must contain exactly one item for every record.'),
    );
  }

  const comparisonKeys = new Set<string>();
  for (const [position, item] of plan.items.entries()) {
    if (item.recordIndex !== position || item.recordIndex >= recordCount) {
      diagnostics.push(
        invalidPlan('Plan items must preserve record order and reference a valid record index.', {
          item,
        }),
      );
    }

    validateItemPath(plan, item, expectedMode, comparisonKeys, diagnostics);
  }

  if (expectedMode === 'archive' && plan.mode === 'archive') {
    validateArchiveTarget(plan, diagnostics);
  }

  return diagnostics;
}

function validateItemPath(
  plan: DirectoryOutputPlan | ArchiveOutputPlan,
  item: DocxOutputPlanItem,
  expectedMode: 'directory' | 'archive',
  comparisonKeys: Set<string>,
  diagnostics: OutputPlanDiagnostic[],
): void {
  const segments = item.relativePath.split('/');
  if (
    item.relativePath.length === 0 ||
    item.relativePath.includes('\\') ||
    item.relativePath.startsWith('/') ||
    item.relativePath.endsWith('/') ||
    segments.includes('')
  ) {
    diagnostics.push(
      invalidPlan('A plan item contains an invalid relative DOCX path.', {
        item,
        path: item.relativePath,
      }),
    );
    return;
  }

  for (const segment of segments) {
    const reason = validateWindowsFilenameSegment(segment);
    if (reason !== undefined) {
      diagnostics.push(
        invalidPlan('A plan item contains an invalid Windows-compatible path segment.', {
          item,
          path: item.relativePath,
          reason,
        }),
      );
      return;
    }
  }

  if (path.win32.extname(segments.at(-1)!).toLocaleLowerCase('en-US') !== '.docx') {
    diagnostics.push(
      invalidPlan('A plan item must use the .docx extension.', {
        item,
        path: item.relativePath,
        reason: 'UnsupportedExtension',
      }),
    );
  }

  const comparisonKey = item.relativePath.toLocaleLowerCase('en-US');
  if (comparisonKeys.has(comparisonKey)) {
    diagnostics.push(
      invalidPlan('The accepted output plan contains duplicate DOCX paths.', {
        item,
        path: item.relativePath,
      }),
    );
  } else {
    comparisonKeys.add(comparisonKey);
  }

  if (expectedMode === 'archive') {
    if (item.destinationPath !== undefined) {
      diagnostics.push(
        invalidPlan('Archive plan items must not contain filesystem destination paths.', { item }),
      );
    }
    return;
  }

  const destinationPath = path.resolve(plan.rootDirectory, ...segments);
  if (
    item.destinationPath === undefined ||
    !pathsEqual(destinationPath, path.resolve(item.destinationPath)) ||
    !isPathContained(path.resolve(plan.rootDirectory), destinationPath)
  ) {
    diagnostics.push(
      invalidPlan('A directory plan item does not match its accepted destination path.', {
        item,
        path: item.destinationPath ?? destinationPath,
      }),
    );
  }
}

function validateArchiveTarget(plan: ArchiveOutputPlan, diagnostics: OutputPlanDiagnostic[]): void {
  const reason = validateWindowsFilenameSegment(plan.archiveFileName);
  const expectedPath = path.resolve(plan.rootDirectory, plan.archiveFileName);

  if (
    reason !== undefined ||
    plan.archiveFileName.includes('/') ||
    plan.archiveFileName.includes('\\') ||
    path.win32.extname(plan.archiveFileName).toLocaleLowerCase('en-US') !== '.zip'
  ) {
    diagnostics.push(
      invalidPlan('The accepted archive plan contains an invalid ZIP file name.', {
        path: plan.archiveFileName,
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  }

  if (
    !pathsEqual(expectedPath, path.resolve(plan.archivePath)) ||
    !isPathContained(path.resolve(plan.rootDirectory), expectedPath)
  ) {
    diagnostics.push(
      invalidPlan('The accepted archive plan does not match its ZIP destination path.', {
        path: plan.archivePath,
      }),
    );
  }
}

function invalidPlan(
  message: string,
  context: {
    readonly item?: DocxOutputPlanItem;
    readonly path?: string;
    readonly reason?: OutputPlanDiagnostic['reason'];
  } = {},
): OutputPlanDiagnostic {
  return {
    code: 'InvalidOutputPlan',
    message,
    severity: 'error',
    ...(context.item === undefined ? {} : { recordIndex: context.item.recordIndex }),
    ...(context.path === undefined ? {} : { path: context.path }),
    ...(context.reason === undefined ? {} : { reason: context.reason }),
  };
}

function pathsEqual(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
}
