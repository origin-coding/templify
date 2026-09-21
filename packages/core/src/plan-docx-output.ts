import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type { DocumentOutputErrorReason } from './errors.js';
import type { FieldDefinition, ScalarFieldDefinition } from './field-definition.js';
import { formatFieldValue } from './format-field-value.js';
import { isPathContained, validateWindowsFilenameSegment } from './output-path.js';
import type { PrimitiveValue, RecordData } from './record-data.js';
import type { ConflictPolicy } from './write-single-document.js';

export type DocxOutputMode = 'single-document' | 'directory' | 'archive';

export interface SingleDocumentPlanTarget {
  readonly mode: 'single-document';
  readonly rootDirectory: string;
  /** Literal caller-provided final name. Braces have no placeholder meaning in this mode. */
  readonly fileName: string;
}

export interface DirectoryPlanTarget {
  readonly mode: 'directory';
  readonly rootDirectory: string;
  /** Literal text plus {topLevelScalarField} and the one-based {$index}. */
  readonly pathTemplate: string;
}

export interface ArchivePlanTarget {
  readonly mode: 'archive';
  readonly rootDirectory: string;
  readonly fileName: string;
  /** Literal text plus {topLevelScalarField} and the one-based {$index}. */
  readonly entryPathTemplate: string;
}

export type DocxOutputPlanTarget =
  | SingleDocumentPlanTarget
  | DirectoryPlanTarget
  | ArchivePlanTarget;

export interface CreateDocxOutputPlanInput {
  readonly records: readonly RecordData[];
  readonly fields: readonly FieldDefinition[];
  readonly target: DocxOutputPlanTarget;
  readonly conflictPolicy?: ConflictPolicy;
}

export interface DocxOutputPlanItem {
  /** Zero-based index into the input records. */
  readonly recordIndex: number;
  /** Canonical relative path. Forward slashes separate literal template segments. */
  readonly relativePath: string;
  /** Present for filesystem DOCX targets; absent for entries inside an archive. */
  readonly destinationPath?: string;
}

interface DocxOutputPlanBase {
  readonly mode: DocxOutputMode;
  readonly rootDirectory: string;
  readonly conflictPolicy: ConflictPolicy;
  readonly items: readonly DocxOutputPlanItem[];
}

export interface SingleDocumentOutputPlan extends DocxOutputPlanBase {
  readonly mode: 'single-document';
}

export interface DirectoryOutputPlan extends DocxOutputPlanBase {
  readonly mode: 'directory';
}

export interface ArchiveOutputPlan extends DocxOutputPlanBase {
  readonly mode: 'archive';
  readonly archiveFileName: string;
  readonly archivePath: string;
}

export type DocxOutputPlan = SingleDocumentOutputPlan | DirectoryOutputPlan | ArchiveOutputPlan;

export type OutputPlanDiagnosticCode =
  | 'InvalidOutputPlan'
  | 'InvalidRecordCount'
  | 'InvalidConflictPolicy'
  | 'InvalidOutputRoot'
  | 'InvalidNamingTemplate'
  | 'UnknownNamingPlaceholder'
  | 'CollectionNamingPlaceholder'
  | 'MissingNamingValue'
  | 'InvalidNamingValue'
  | 'InvalidOutputPath'
  | 'DuplicateOutputPath'
  | 'OutputRootNotFound'
  | 'OutputRootNotDirectory'
  | 'OutputTargetIsDirectory'
  | 'OutputConflict'
  | 'OutputSameAsTemplate'
  | 'OutputPathUnavailable';

export interface OutputPlanDiagnostic {
  readonly code: OutputPlanDiagnosticCode;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly reason?: DocumentOutputErrorReason;
  /** Zero-based index into the input records. */
  readonly recordIndex?: number;
  /** Zero-based index of the earlier record producing the same path. */
  readonly conflictingRecordIndex?: number;
  readonly placeholder?: string;
  readonly path?: string;
  readonly systemCode?: string;
}

export interface DraftDocxOutputPlan {
  readonly mode: DocxOutputMode;
  readonly items: readonly DocxOutputPlanItem[];
}

export type CreateDocxOutputPlanResult =
  | { readonly ok: true; readonly plan: DocxOutputPlan }
  | {
      readonly ok: false;
      readonly draft: DraftDocxOutputPlan;
      readonly errors: readonly OutputPlanDiagnostic[];
    };

export interface OutputPlanPreflightOptions {
  readonly sourceTemplatePath?: string;
}

export interface OutputPlanPreflightResult {
  readonly ok: boolean;
  readonly plan: DocxOutputPlan;
  readonly diagnostics: readonly OutputPlanDiagnostic[];
}

interface LiteralToken {
  readonly kind: 'literal';
  readonly value: string;
}

interface IndexToken {
  readonly kind: 'index';
}

interface FieldToken {
  readonly kind: 'field';
  readonly field: ScalarFieldDefinition;
}

type NamingToken = LiteralToken | IndexToken | FieldToken;
type CompiledSegment = readonly NamingToken[];

interface CompileResult {
  readonly segments: readonly CompiledSegment[];
  readonly errors: readonly OutputPlanDiagnostic[];
}

/** Creates a deterministic plan without rendering documents or accessing the filesystem. */
export function createDocxOutputPlan(input: CreateDocxOutputPlanInput): CreateDocxOutputPlanResult {
  const errors: OutputPlanDiagnostic[] = [];
  const target = input.target;
  const rootDirectory = validateRootDirectory(target.rootDirectory, errors);

  const hasValidRecordCount =
    input.records.length > 0 && (target.mode !== 'single-document' || input.records.length === 1);

  if (!hasValidRecordCount) {
    errors.push({
      code: 'InvalidRecordCount',
      message:
        target.mode === 'single-document'
          ? 'Single-document output requires exactly one record.'
          : 'Multi-document output requires at least one record.',
      severity: 'error',
    });
  }

  if (
    input.conflictPolicy !== undefined &&
    input.conflictPolicy !== 'error' &&
    input.conflictPolicy !== 'overwrite'
  ) {
    errors.push({
      code: 'InvalidConflictPolicy',
      message: 'The conflict policy must be either "error" or "overwrite".',
      severity: 'error',
    });
  }

  const namingTemplate =
    target.mode === 'single-document'
      ? target.fileName
      : target.mode === 'directory'
        ? target.pathTemplate
        : target.entryPathTemplate;

  const compiled =
    target.mode === 'single-document'
      ? compileSingleDocumentName(namingTemplate)
      : compileNamingTemplate(namingTemplate, input.fields);
  errors.push(...compiled.errors);

  let archiveFileName: string | undefined;
  if (target.mode === 'archive') {
    archiveFileName = target.fileName;
    validateStandaloneFileName(archiveFileName, '.zip', errors);
  }

  const items: DocxOutputPlanItem[] = [];
  const pathsByComparisonKey = new Map<string, number>();

  if (compiled.errors.length === 0 && rootDirectory !== undefined && hasValidRecordCount) {
    for (const [recordIndex, record] of input.records.entries()) {
      const relativePath = expandNamingTemplate(compiled.segments, record, recordIndex, errors);
      if (relativePath === undefined) continue;

      const pathErrorCount = errors.length;
      validateDocxRelativePath(relativePath, recordIndex, errors);
      if (errors.length !== pathErrorCount) continue;

      const comparisonKey = relativePath.toLocaleLowerCase('en-US');
      const conflictingRecordIndex = pathsByComparisonKey.get(comparisonKey);
      if (conflictingRecordIndex !== undefined) {
        errors.push({
          code: 'DuplicateOutputPath',
          message: `Records ${conflictingRecordIndex + 1} and ${recordIndex + 1} produce the same output path "${relativePath}".`,
          severity: 'error',
          recordIndex,
          conflictingRecordIndex,
          path: relativePath,
        });
        continue;
      }

      pathsByComparisonKey.set(comparisonKey, recordIndex);
      items.push(createPlanItem(target.mode, rootDirectory, recordIndex, relativePath));
    }
  }

  if (errors.length > 0 || rootDirectory === undefined) {
    return { ok: false, draft: { mode: target.mode, items }, errors };
  }

  const common = {
    rootDirectory,
    conflictPolicy: input.conflictPolicy ?? 'error',
    items,
  } as const;

  switch (target.mode) {
    case 'single-document':
      return { ok: true, plan: { mode: target.mode, ...common } };
    case 'directory':
      return { ok: true, plan: { mode: target.mode, ...common } };
    case 'archive': {
      const resolvedArchiveFileName = archiveFileName!;
      return {
        ok: true,
        plan: {
          mode: target.mode,
          ...common,
          archiveFileName: resolvedArchiveFileName,
          archivePath: path.resolve(rootDirectory, resolvedArchiveFileName),
        },
      };
    }
  }
}

/** Inspects current filesystem state without writing. Execution must recheck race-sensitive conditions. */
export async function preflightDocxOutputPlan(
  plan: DocxOutputPlan,
  options: OutputPlanPreflightOptions = {},
): Promise<OutputPlanPreflightResult> {
  const diagnostics: OutputPlanDiagnostic[] = [];
  let realRoot: string;

  try {
    const rootStats = await stat(plan.rootDirectory);
    if (!rootStats.isDirectory()) {
      diagnostics.push({
        code: 'OutputRootNotDirectory',
        message: 'The output root is not a directory.',
        severity: 'error',
        reason: 'RootNotDirectory',
        path: plan.rootDirectory,
      });
      return result();
    }
    realRoot = await realpath(plan.rootDirectory);
  } catch (cause) {
    const code = systemCode(cause);
    diagnostics.push({
      code: code === 'ENOENT' ? 'OutputRootNotFound' : 'OutputPathUnavailable',
      message:
        code === 'ENOENT'
          ? 'The output root does not exist.'
          : 'The output root could not be inspected.',
      severity: 'error',
      reason: code === 'ENOENT' ? 'DirectoryNotFound' : mapSystemReason(code),
      path: plan.rootDirectory,
      ...(code === undefined ? {} : { systemCode: code }),
    });
    return result();
  }

  const sourceIdentity = await inspectSourceIdentity(options.sourceTemplatePath, diagnostics);
  const destinations: readonly { readonly path: string; readonly recordIndex?: number }[] =
    plan.mode === 'archive'
      ? [{ path: plan.archivePath }]
      : plan.items.map((item) => ({ path: item.destinationPath!, recordIndex: item.recordIndex }));

  const destinationDiagnostics = await Promise.all(
    destinations.map(async (destination) => {
      const itemDiagnostics: OutputPlanDiagnostic[] = [];
      await inspectDestination(
        destination.path,
        destination.recordIndex,
        realRoot,
        plan.conflictPolicy,
        sourceIdentity,
        itemDiagnostics,
      );
      return itemDiagnostics;
    }),
  );
  diagnostics.push(...destinationDiagnostics.flat());

  return result();

  function result(): OutputPlanPreflightResult {
    return {
      ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
      plan,
      diagnostics,
    };
  }
}

function validateRootDirectory(
  rootDirectory: string,
  errors: OutputPlanDiagnostic[],
): string | undefined {
  if (!path.isAbsolute(rootDirectory)) {
    errors.push({
      code: 'InvalidOutputRoot',
      message: 'The output root must be an absolute path.',
      severity: 'error',
      reason: 'RootNotAbsolute',
      path: rootDirectory,
    });
    return undefined;
  }

  return path.resolve(rootDirectory);
}

function compileSingleDocumentName(fileName: string): CompileResult {
  if (fileName.includes('/') || fileName.includes('\\')) {
    return {
      segments: [],
      errors: [
        {
          code: 'InvalidNamingTemplate',
          message: 'A single-document output name cannot contain a directory path.',
          severity: 'error',
          reason: 'NestedFilename',
          path: fileName,
        },
      ],
    };
  }

  return { segments: [[{ kind: 'literal', value: fileName }]], errors: [] };
}

function compileNamingTemplate(source: string, fields: readonly FieldDefinition[]): CompileResult {
  const errors: OutputPlanDiagnostic[] = [];
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  const rawSegments = splitNamingTemplateSegments(source, errors);

  if (source.length === 0) {
    return {
      segments: [],
      errors: [invalidTemplate('The output naming template cannot be empty.', source)],
    };
  }

  if (source.startsWith('/') || source.endsWith('/') || rawSegments.includes('')) {
    errors.push(
      invalidTemplate('The output naming template contains an empty path segment.', source),
    );
  }

  const segments = rawSegments.map((segment) => compileSegment(segment, fieldsByName, errors));
  return { segments, errors };
}

function splitNamingTemplateSegments(
  source: string,
  errors: OutputPlanDiagnostic[],
): readonly string[] {
  const segments: string[] = [];
  let segmentStart = 0;
  let cursor = 0;
  let reportedBackslash = false;

  while (cursor < source.length) {
    if (source[cursor] === '{') {
      const closingBrace = source.indexOf('}', cursor + 1);
      if (closingBrace === -1) break;
      cursor = closingBrace + 1;
      continue;
    }

    if (source[cursor] === '/') {
      segments.push(source.slice(segmentStart, cursor));
      segmentStart = cursor + 1;
    } else if (source[cursor] === '\\' && !reportedBackslash) {
      errors.push(
        invalidTemplate(
          'Backslashes are not supported in output naming templates; use forward slashes for literal directories.',
          source,
        ),
      );
      reportedBackslash = true;
    }
    cursor += 1;
  }

  segments.push(source.slice(segmentStart));
  return segments;
}

function compileSegment(
  source: string,
  fieldsByName: ReadonlyMap<string, FieldDefinition>,
  errors: OutputPlanDiagnostic[],
): CompiledSegment {
  const tokens: NamingToken[] = [];
  let literalStart = 0;
  let cursor = 0;

  while (cursor < source.length) {
    const character = source[cursor];
    if (character === '}') {
      errors.push(
        invalidTemplate('The output naming template contains an unmatched closing brace.', source),
      );
      return [];
    }
    if (character !== '{') {
      cursor += 1;
      continue;
    }

    if (cursor > literalStart) {
      tokens.push({ kind: 'literal', value: source.slice(literalStart, cursor) });
    }

    const closingBrace = source.indexOf('}', cursor + 1);
    if (closingBrace === -1) {
      errors.push(
        invalidTemplate('The output naming template contains an unclosed placeholder.', source),
      );
      return [];
    }

    const placeholder = source.slice(cursor + 1, closingBrace).trim();
    if (placeholder.length === 0 || placeholder.includes('{')) {
      errors.push(
        invalidTemplate('The output naming template contains an invalid placeholder.', source),
      );
    } else if (placeholder === '$index') {
      tokens.push({ kind: 'index' });
    } else {
      const field = fieldsByName.get(placeholder);
      if (field === undefined) {
        errors.push({
          code: 'UnknownNamingPlaceholder',
          message: `Output naming placeholder "${placeholder}" is not a top-level template field.`,
          severity: 'error',
          placeholder,
        });
      } else if (field.kind === 'collection') {
        errors.push({
          code: 'CollectionNamingPlaceholder',
          message: `Collection field "${placeholder}" cannot be used in an output name.`,
          severity: 'error',
          placeholder,
        });
      } else {
        tokens.push({ kind: 'field', field });
      }
    }

    cursor = closingBrace + 1;
    literalStart = cursor;
  }

  if (literalStart < source.length) {
    tokens.push({ kind: 'literal', value: source.slice(literalStart) });
  }

  return tokens;
}

function expandNamingTemplate(
  segments: readonly CompiledSegment[],
  record: RecordData,
  recordIndex: number,
  errors: OutputPlanDiagnostic[],
): string | undefined {
  const expandedSegments: string[] = [];
  const errorCount = errors.length;

  for (const tokens of segments) {
    let expanded = '';
    for (const token of tokens) {
      if (token.kind === 'literal') {
        expanded += token.value;
      } else if (token.kind === 'index') {
        expanded += String(recordIndex + 1);
      } else if (!Object.hasOwn(record, token.field.name)) {
        errors.push({
          code: 'MissingNamingValue',
          message: `Record ${recordIndex + 1} is missing naming field "${token.field.name}".`,
          severity: 'error',
          recordIndex,
          placeholder: token.field.name,
        });
      } else {
        const formatted = formatNamingFieldValue(
          token.field,
          record[token.field.name],
          recordIndex,
          errors,
        );
        if (formatted !== undefined) expanded += formatted;
      }
    }
    expandedSegments.push(expanded);
  }

  return errors.length === errorCount ? expandedSegments.join('/') : undefined;
}

function formatNamingFieldValue(
  field: ScalarFieldDefinition,
  value: unknown,
  recordIndex: number,
  errors: OutputPlanDiagnostic[],
): string | undefined {
  if (!isPrimitiveValue(value)) {
    errors.push({
      code: 'InvalidNamingValue',
      message: `Naming field "${field.name}" in record ${recordIndex + 1} must contain a supported scalar value.`,
      severity: 'error',
      recordIndex,
      placeholder: field.name,
    });
    return undefined;
  }

  try {
    const formatted = formatFieldValue(field, value, [field.name]);
    if (formatted.includes('/') || formatted.includes('\\')) {
      errors.push({
        code: 'InvalidNamingValue',
        message: `Naming field "${field.name}" in record ${recordIndex + 1} cannot introduce a path separator.`,
        severity: 'error',
        reason: 'InvalidCharacter',
        recordIndex,
        placeholder: field.name,
      });
      return undefined;
    }
    return formatted;
  } catch {
    errors.push({
      code: 'InvalidNamingValue',
      message: `Naming field "${field.name}" in record ${recordIndex + 1} does not match its template type hint.`,
      severity: 'error',
      recordIndex,
      placeholder: field.name,
    });
    return undefined;
  }
}

function validateDocxRelativePath(
  relativePath: string,
  recordIndex: number,
  errors: OutputPlanDiagnostic[],
): void {
  const segments = relativePath.split('/');
  for (const segment of segments) {
    const reason = validateWindowsFilenameSegment(segment);
    if (reason !== undefined) {
      errors.push({
        code: 'InvalidOutputPath',
        message: `Record ${recordIndex + 1} produces an invalid Windows-compatible path segment "${segment}".`,
        severity: 'error',
        reason,
        recordIndex,
        path: relativePath,
      });
      return;
    }
  }

  const fileName = segments.at(-1)!;
  if (path.win32.extname(fileName).toLocaleLowerCase('en-US') !== '.docx') {
    errors.push({
      code: 'InvalidOutputPath',
      message: `Record ${recordIndex + 1} produces an output path without a .docx extension.`,
      severity: 'error',
      reason: 'UnsupportedExtension',
      recordIndex,
      path: relativePath,
    });
  }
}

function validateStandaloneFileName(
  fileName: string,
  extension: string,
  errors: OutputPlanDiagnostic[],
): void {
  let reason = validateWindowsFilenameSegment(fileName);
  if (fileName.includes('/') || fileName.includes('\\')) reason = 'NestedFilename';
  if (path.win32.isAbsolute(fileName)) reason = 'AbsoluteFilename';
  if (
    reason === undefined &&
    path.win32.extname(fileName).toLocaleLowerCase('en-US') !== extension
  ) {
    reason = 'UnsupportedExtension';
  }
  if (reason === undefined) return;

  errors.push({
    code: 'InvalidOutputPath',
    message: `The output file name "${fileName}" is invalid.`,
    severity: 'error',
    reason,
    path: fileName,
  });
}

function createPlanItem(
  mode: DocxOutputMode,
  rootDirectory: string,
  recordIndex: number,
  relativePath: string,
): DocxOutputPlanItem {
  if (mode === 'archive') return { recordIndex, relativePath };
  return {
    recordIndex,
    relativePath,
    destinationPath: path.resolve(rootDirectory, ...relativePath.split('/')),
  };
}

async function inspectSourceIdentity(
  sourceTemplatePath: string | undefined,
  diagnostics: OutputPlanDiagnostic[],
): Promise<
  { readonly realPath: string; readonly device: number; readonly inode: number } | undefined
> {
  if (sourceTemplatePath === undefined) return undefined;
  if (!path.isAbsolute(sourceTemplatePath)) {
    diagnostics.push({
      code: 'OutputPathUnavailable',
      message: 'The source template path must be absolute.',
      severity: 'error',
      reason: 'RootNotAbsolute',
      path: sourceTemplatePath,
    });
    return undefined;
  }

  try {
    const [realPath, stats] = await Promise.all([
      realpath(sourceTemplatePath),
      stat(sourceTemplatePath),
    ]);
    return { realPath, device: stats.dev, inode: stats.ino };
  } catch (cause) {
    const code = systemCode(cause);
    diagnostics.push({
      code: 'OutputPathUnavailable',
      message: 'The source template could not be inspected.',
      severity: 'error',
      path: sourceTemplatePath,
      ...(code === undefined ? {} : { systemCode: code }),
    });
    return undefined;
  }
}

async function inspectDestination(
  destinationPath: string,
  recordIndex: number | undefined,
  realRoot: string,
  conflictPolicy: ConflictPolicy,
  sourceIdentity:
    | { readonly realPath: string; readonly device: number; readonly inode: number }
    | undefined,
  diagnostics: OutputPlanDiagnostic[],
): Promise<void> {
  const nearestExisting = await findNearestExistingPath(path.dirname(destinationPath));
  if (nearestExisting.error !== undefined) {
    diagnostics.push(withRecord(nearestExisting.error, recordIndex));
    return;
  }

  let realParent: string;
  try {
    realParent = await realpath(nearestExisting.path);
  } catch (cause) {
    const code = systemCode(cause);
    diagnostics.push({
      code: 'OutputPathUnavailable',
      message: 'An output path parent could not be resolved.',
      severity: 'error',
      reason: mapSystemReason(code),
      path: nearestExisting.path,
      ...(recordIndex === undefined ? {} : { recordIndex }),
      ...(code === undefined ? {} : { systemCode: code }),
    });
    return;
  }

  const unresolvedTail = path.relative(nearestExisting.path, path.dirname(destinationPath));
  const reconstructedDestination = path.resolve(
    realParent,
    unresolvedTail,
    path.basename(destinationPath),
  );
  if (!isPathContained(realRoot, reconstructedDestination)) {
    diagnostics.push({
      code: 'InvalidOutputPath',
      message: 'The output path escapes the selected output root.',
      severity: 'error',
      reason: 'OutsideOutputRoot',
      path: destinationPath,
      ...(recordIndex === undefined ? {} : { recordIndex }),
    });
    return;
  }

  let destinationDiscovered = false;
  try {
    const linkStats = await lstat(destinationPath);
    destinationDiscovered = true;
    const stats = linkStats.isSymbolicLink() ? await stat(destinationPath) : linkStats;
    if (stats.isDirectory()) {
      diagnostics.push({
        code: 'OutputTargetIsDirectory',
        message: 'The output target is an existing directory.',
        severity: 'error',
        reason: 'TargetIsDirectory',
        path: destinationPath,
        ...(recordIndex === undefined ? {} : { recordIndex }),
      });
      return;
    }

    const realDestination = await realpath(destinationPath);
    if (
      sourceIdentity !== undefined &&
      (pathsEqual(realDestination, sourceIdentity.realPath) ||
        (stats.dev === sourceIdentity.device && stats.ino === sourceIdentity.inode))
    ) {
      diagnostics.push({
        code: 'OutputSameAsTemplate',
        message: 'The output target resolves to the source template.',
        severity: 'error',
        reason: 'SameFile',
        path: destinationPath,
        ...(recordIndex === undefined ? {} : { recordIndex }),
      });
      return;
    }

    diagnostics.push({
      code: 'OutputConflict',
      message:
        conflictPolicy === 'overwrite'
          ? 'The existing output target will be overwritten.'
          : 'The output target already exists.',
      severity: conflictPolicy === 'overwrite' ? 'warning' : 'error',
      reason: 'TargetExists',
      path: destinationPath,
      ...(recordIndex === undefined ? {} : { recordIndex }),
    });
  } catch (cause) {
    const code = systemCode(cause);
    if (code === 'ENOENT' && !destinationDiscovered) return;
    diagnostics.push({
      code: 'OutputPathUnavailable',
      message: 'The output target could not be inspected.',
      severity: 'error',
      reason: mapSystemReason(code),
      path: destinationPath,
      ...(recordIndex === undefined ? {} : { recordIndex }),
      ...(code === undefined ? {} : { systemCode: code }),
    });
  }
}

async function findNearestExistingPath(
  candidate: string,
): Promise<
  | { readonly path: string; readonly error?: never }
  | { readonly path?: never; readonly error: OutputPlanDiagnostic }
> {
  try {
    const stats = await stat(candidate);
    if (!stats.isDirectory()) {
      return {
        error: {
          code: 'OutputPathUnavailable',
          message: 'An output path parent is not a directory.',
          severity: 'error',
          reason: 'RootNotDirectory',
          path: candidate,
        },
      };
    }
    return { path: candidate };
  } catch (cause) {
    const code = systemCode(cause);
    if (code !== 'ENOENT') {
      return {
        error: {
          code: 'OutputPathUnavailable',
          message: 'An output path parent could not be inspected.',
          severity: 'error',
          reason: mapSystemReason(code),
          path: candidate,
          ...(code === undefined ? {} : { systemCode: code }),
        },
      };
    }
  }

  const parent = path.dirname(candidate);
  if (parent === candidate) {
    return {
      error: {
        code: 'OutputPathUnavailable',
        message: 'No existing output path parent could be found.',
        severity: 'error',
        reason: 'DirectoryNotFound',
        path: candidate,
      },
    };
  }
  return findNearestExistingPath(parent);
}

function invalidTemplate(message: string, source: string): OutputPlanDiagnostic {
  return { code: 'InvalidNamingTemplate', message, severity: 'error', path: source };
}

function withRecord(
  diagnostic: OutputPlanDiagnostic,
  recordIndex: number | undefined,
): OutputPlanDiagnostic {
  return recordIndex === undefined ? diagnostic : { ...diagnostic, recordIndex };
}

function mapSystemReason(code: string | undefined): DocumentOutputErrorReason {
  if (code === 'EACCES') return 'PermissionDenied';
  if (code === 'EPERM' || code === 'EBUSY') return 'AccessDeniedOrFileInUse';
  if (code === 'ENAMETOOLONG') return 'PathTooLong';
  return 'IoFailure';
}

function systemCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error as { readonly code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

function pathsEqual(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
}

function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}
