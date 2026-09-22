import path from 'node:path';

import type { NormalizedRecordBatch } from '@/input/normalized-record-batch.js';
import type { RecordData } from '@/input/record-data.js';
import type { ValidatedRenderOptions } from '@/rendering/validated-render-options.js';
import type { StageResult } from '@/stage-result.js';
import type { FieldDefinition, ScalarFieldDefinition } from '@/template/field-definition.js';
import type { TemplateDefinition } from '@/template/template-definition.js';
import {
  artifactPathComparisonKey,
  validateArtifactPathSegment,
  validateArtifactRelativePath,
  validateStandaloneArtifactFileName,
} from './artifact-path.js';
import type { GenerationPlanError, GenerationPlanWarning } from './generation-diagnostics.js';
import type { AggregatePlanItem, DocumentPlanItem, GenerationPlan } from './generation-plan.js';
import type { DocumentOutputSelection, GenerationRequest } from './generation-request.js';

export interface CreateGenerationPlanInput {
  readonly definition: TemplateDefinition;
  readonly batch: NormalizedRecordBatch;
  readonly renderOptions: ValidatedRenderOptions;
  readonly request: GenerationRequest;
}

export type CreateGenerationPlanResult = StageResult<
  GenerationPlan,
  GenerationPlanError,
  GenerationPlanWarning
>;

type NamingToken =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'index' }
  | { readonly kind: 'field'; readonly field: ScalarFieldDefinition };

interface ExpandedPath {
  readonly path: string;
  readonly sanitizedFields: readonly string[];
  readonly dynamicFieldsBySegment: readonly (readonly string[])[];
}

export function createGenerationPlan(input: CreateGenerationPlanInput): CreateGenerationPlanResult {
  const errors: GenerationPlanError[] = [];
  const warnings: GenerationPlanWarning[] = [];
  const { request } = input;
  const recordCount = input.batch.records.length;

  if (recordCount === 0 || (request.naming.kind === 'single' && recordCount !== 1)) {
    errors.push({
      code: 'InvalidRecordCount',
      expected: request.naming.kind === 'single' ? 'one' : 'one-or-more',
    });
  }

  const compiled =
    request.naming.kind === 'single'
      ? compileSingleName(request.naming.fileName, errors)
      : compileTemplate(request.naming.pathTemplate, input.definition.fields, errors);
  const documents: DocumentPlanItem[] = [];
  const docxPaths = new Map<string, string>();

  if (errors.length === 0) {
    input.batch.records.forEach((record, recordIndex) => {
      const documentId = `document-${recordIndex}`;
      const expanded = expandPath(
        compiled,
        record,
        recordIndex,
        input.renderOptions.timeZone,
        errors,
      );
      if (expanded === undefined) return;
      const canonicalPath = canonicalizeDocumentPath(
        expanded.path,
        request.documentOutputs,
        recordIndex,
        errors,
      );
      if (canonicalPath === undefined) return;
      const repaired = repairDynamicReservedSegments(
        canonicalPath,
        expanded.dynamicFieldsBySegment,
      );
      const reason = validateArtifactRelativePath(repaired.path, '.docx');
      if (reason !== undefined) {
        errors.push({
          code: 'InvalidArtifactPath',
          path: repaired.path,
          reason,
          recordIndex,
        });
        return;
      }
      const key = artifactPathComparisonKey(repaired.path);
      const priorId = docxPaths.get(key);
      if (priorId !== undefined) {
        errors.push({
          code: 'DuplicateArtifactPath',
          path: repaired.path,
          firstId: priorId,
          secondId: documentId,
        });
        return;
      }
      docxPaths.set(key, documentId);
      documents.push({ documentId, recordIndex, docxPath: repaired.path });
      for (const fieldName of new Set([...expanded.sanitizedFields, ...repaired.repairedFields])) {
        warnings.push({
          code: 'NamingValueSanitized',
          recordIndex,
          fieldName,
          resultingPath: repaired.path,
        });
      }
    });
  }

  const aggregates = createAggregatePlans(request, documents, errors);
  const bundle = request.bundle ?? ({ kind: 'individual-files' } as const);
  if (bundle.kind === 'zip') {
    const reason = validateStandaloneArtifactFileName(bundle.fileName, '.zip');
    if (reason !== undefined) {
      errors.push({ code: 'InvalidArtifactPath', path: bundle.fileName, reason });
    }
  }
  validateFinalArtifactPaths(request.documentOutputs, documents, aggregates, errors);

  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors as [GenerationPlanError, ...GenerationPlanError[]],
      warnings,
    };
  }
  return {
    ok: true,
    value: {
      version: 1,
      documentOutputs: request.documentOutputs,
      documents,
      aggregates,
      bundle,
    },
    warnings,
  };
}

function compileSingleName(
  fileName: string,
  errors: GenerationPlanError[],
): readonly (readonly NamingToken[])[] {
  if (fileName.includes('/') || fileName.includes('\\')) {
    errors.push({ code: 'InvalidNamingTemplate', reason: 'SingleNameContainsPath' });
  }
  return [[{ kind: 'literal', value: fileName }]];
}

function compileTemplate(
  source: string,
  fields: readonly FieldDefinition[],
  errors: GenerationPlanError[],
): readonly (readonly NamingToken[])[] {
  if (source.length === 0) {
    errors.push({ code: 'InvalidNamingTemplate', reason: 'EmptyTemplate' });
    return [];
  }
  if (source.startsWith('/') || source.endsWith('/') || source.includes('\\')) {
    errors.push({ code: 'InvalidNamingTemplate', reason: 'InvalidPathSeparator' });
  }
  const rawSegments = splitSegments(source, errors);
  if (rawSegments.some((segment) => segment.length === 0)) {
    errors.push({ code: 'InvalidNamingTemplate', reason: 'EmptyPathSegment' });
  }
  const byName = new Map(fields.map((field) => [field.name, field]));
  return rawSegments.map((segment) => compileSegment(segment, byName, errors));
}

function splitSegments(source: string, errors: GenerationPlanError[]): readonly string[] {
  const segments: string[] = [];
  let start = 0;
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] === '{') {
      const closing = source.indexOf('}', cursor + 1);
      if (closing === -1) {
        errors.push({ code: 'InvalidNamingTemplate', reason: 'UnclosedPlaceholder' });
        return [source];
      }
      cursor = closing + 1;
    } else {
      if (source[cursor] === '/') {
        segments.push(source.slice(start, cursor));
        start = cursor + 1;
      }
      cursor += 1;
    }
  }
  segments.push(source.slice(start));
  return segments;
}

function compileSegment(
  source: string,
  fields: ReadonlyMap<string, FieldDefinition>,
  errors: GenerationPlanError[],
): readonly NamingToken[] {
  const tokens: NamingToken[] = [];
  let literalStart = 0;
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] === '}') {
      errors.push({ code: 'InvalidNamingTemplate', reason: 'UnmatchedClosingBrace' });
      return tokens;
    }
    if (source[cursor] !== '{') {
      cursor += 1;
      continue;
    }
    if (cursor > literalStart) addLiteral(source.slice(literalStart, cursor), tokens, errors);
    const closing = source.indexOf('}', cursor + 1);
    if (closing === -1) return tokens;
    const placeholder = source.slice(cursor + 1, closing).trim();
    if (placeholder.length === 0 || placeholder.includes('{')) {
      errors.push({ code: 'InvalidNamingTemplate', reason: 'InvalidPlaceholder' });
    } else if (placeholder === '$index') {
      tokens.push({ kind: 'index' });
    } else {
      const field = fields.get(placeholder);
      if (field === undefined) {
        errors.push({ code: 'UnknownNamingField', fieldName: placeholder });
      } else if (field.kind === 'collection') {
        errors.push({ code: 'CollectionNamingField', fieldName: placeholder });
      } else {
        tokens.push({ kind: 'field', field });
      }
    }
    cursor = closing + 1;
    literalStart = cursor;
  }
  if (literalStart < source.length) addLiteral(source.slice(literalStart), tokens, errors);
  return tokens;
}

function addLiteral(value: string, tokens: NamingToken[], errors: GenerationPlanError[]): void {
  if (/[<>:"\\|?*]/u.test(value) || [...value].some(isControlCharacter)) {
    errors.push({ code: 'InvalidNamingTemplate', reason: 'InvalidLiteralCharacter' });
  }
  tokens.push({ kind: 'literal', value });
}

function expandPath(
  segments: readonly (readonly NamingToken[])[],
  record: RecordData,
  recordIndex: number,
  timeZone: string,
  errors: GenerationPlanError[],
): ExpandedPath | undefined {
  const expanded: string[] = [];
  const sanitizedFields = new Set<string>();
  const dynamicFieldsBySegment: string[][] = [];
  const errorCount = errors.length;
  for (const tokens of segments) {
    let segment = '';
    const dynamicFields = new Set<string>();
    for (const token of tokens) {
      if (token.kind === 'literal') segment += token.value;
      else if (token.kind === 'index') segment += String(recordIndex + 1);
      else if (!Object.hasOwn(record, token.field.name)) {
        errors.push({
          code: 'MissingNamingValue',
          recordIndex,
          fieldName: token.field.name,
        });
      } else {
        dynamicFields.add(token.field.name);
        const value = record[token.field.name];
        const formatted = formatNamingValue(token.field, value, recordIndex, timeZone, errors);
        if (formatted !== undefined) {
          const sanitized = sanitizeDynamicValue(formatted);
          if (sanitized !== formatted) sanitizedFields.add(token.field.name);
          segment += sanitized;
        }
      }
    }
    expanded.push(segment);
    dynamicFieldsBySegment.push([...dynamicFields]);
  }
  return errors.length === errorCount
    ? { path: expanded.join('/'), sanitizedFields: [...sanitizedFields], dynamicFieldsBySegment }
    : undefined;
}

function formatNamingValue(
  field: ScalarFieldDefinition,
  value: unknown,
  recordIndex: number,
  timeZone: string,
  errors: GenerationPlanError[],
): string | undefined {
  if (value === null) {
    errors.push({ code: 'NullNamingValue', recordIndex, fieldName: field.name });
    return undefined;
  }
  let formatted: string;
  try {
    switch (field.hint.type) {
      case 'string':
      case 'option':
        if (typeof value !== 'string') throw new TypeError();
        formatted = value;
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError();
        formatted = String(value);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') throw new TypeError();
        formatted = String(value);
        break;
      case 'date':
        if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError();
        formatted = formatDate(value);
        break;
      case 'datetime':
        if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError();
        formatted = formatDateTime(value, timeZone);
        break;
    }
  } catch {
    errors.push({ code: 'InvalidNamingValue', recordIndex, fieldName: field.name });
    return undefined;
  }
  if (formatted.length === 0 || formatted.trim().length === 0) {
    errors.push({ code: 'EmptyNamingValue', recordIndex, fieldName: field.name });
    return undefined;
  }
  return formatted;
}

function sanitizeDynamicValue(value: string): string {
  return [...value]
    .map((character) =>
      /[<>:"/\\|?*]/u.test(character) || isControlCharacter(character) ? '_' : character,
    )
    .join('')
    .replace(/[. ]+$/u, (ending) => '_'.repeat(ending.length));
}

function isControlCharacter(character: string): boolean {
  const point = character.codePointAt(0);
  return point !== undefined && (point <= 0x1f || (point >= 0x7f && point <= 0x9f));
}

function repairDynamicReservedSegments(
  relativePath: string,
  dynamicFieldsBySegment: readonly (readonly string[])[],
): { readonly path: string; readonly repairedFields: readonly string[] } {
  const segments = relativePath.split('/');
  const repairedFields = new Set<string>();
  const repaired = segments.map((segment, index) => {
    const fields = dynamicFieldsBySegment[index] ?? [];
    if (fields.length === 0 || validateArtifactPathSegment(segment) !== 'ReservedDeviceName')
      return segment;
    fields.forEach((field) => repairedFields.add(field));
    return `_${segment}`;
  });
  return { path: repaired.join('/'), repairedFields: [...repairedFields] };
}

function canonicalizeDocumentPath(
  relativePath: string,
  selection: DocumentOutputSelection,
  recordIndex: number,
  errors: GenerationPlanError[],
): string | undefined {
  const expected = selection === 'pdf' ? '.pdf' : '.docx';
  const actual = path.win32.extname(relativePath).toLocaleLowerCase('en-US');
  if (actual !== expected) {
    errors.push({
      code: 'InvalidArtifactPath',
      path: relativePath,
      reason: 'UnsupportedExtension',
      recordIndex,
    });
    return undefined;
  }
  return selection === 'pdf' ? relativePath.replace(/\.pdf$/iu, '.docx') : relativePath;
}

function createAggregatePlans(
  request: GenerationRequest,
  documents: readonly DocumentPlanItem[],
  errors: GenerationPlanError[],
): readonly AggregatePlanItem[] {
  const aggregates: AggregatePlanItem[] = [];
  const ids = new Set<string>();
  for (const [index, aggregate] of (request.aggregates ?? []).entries()) {
    const aggregateId = `aggregate-${index}`;
    if (ids.has(aggregateId)) {
      errors.push({ code: 'DuplicateAggregateId', aggregateId });
      continue;
    }
    ids.add(aggregateId);
    const reason = validateArtifactRelativePath(aggregate.relativePath, '.pdf');
    if (reason !== undefined) {
      errors.push({ code: 'InvalidArtifactPath', path: aggregate.relativePath, reason });
      continue;
    }
    aggregates.push({
      kind: 'merged-pdf',
      aggregateId,
      relativePath: aggregate.relativePath,
      sourceDocumentIds: documents.map((document) => document.documentId),
    });
  }
  return aggregates;
}

function validateFinalArtifactPaths(
  selection: DocumentOutputSelection,
  documents: readonly DocumentPlanItem[],
  aggregates: readonly AggregatePlanItem[],
  errors: GenerationPlanError[],
): void {
  const paths = new Map<string, string>();
  const add = (id: string, relativePath: string): void => {
    const key = artifactPathComparisonKey(relativePath);
    const prior = paths.get(key);
    if (prior === undefined) paths.set(key, id);
    else
      errors.push({
        code: 'DuplicateArtifactPath',
        path: relativePath,
        firstId: prior,
        secondId: id,
      });
  };
  for (const document of documents) {
    if (selection !== 'pdf') add(`${document.documentId}:docx`, document.docxPath);
    if (selection !== 'docx') {
      add(`${document.documentId}:pdf`, document.docxPath.replace(/\.docx$/iu, '.pdf'));
    }
  }
  for (const aggregate of aggregates) add(aggregate.aggregateId, aggregate.relativePath);
}

function formatDate(value: Date): string {
  return [
    String(value.getUTCFullYear()).padStart(4, '0'),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateTime(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}`;
}
