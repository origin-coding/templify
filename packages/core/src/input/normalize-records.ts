import type { StageResult } from '@/stage-result.js';
import type {
  CollectionFieldDefinition,
  ScalarFieldDefinition,
} from '@/template/field-definition.js';
import type { TemplateDefinition } from '@/template/template-definition.js';
import type {
  InputDiagnosticLocation,
  InputNormalizationError,
  InputNormalizationWarning,
  InputValueType,
} from './input-diagnostics.js';
import type { NormalizedRecordBatch } from './normalized-record-batch.js';
import type { RawInputBatch, TabularInput } from './raw-input.js';
import type { CollectionData, CollectionItemData, RecordData, ScalarValue } from './record-data.js';
import type { InputRowOrigin, RecordOrigin } from './record-origin.js';

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/u;

export type NormalizeRecordsResult = StageResult<
  NormalizedRecordBatch,
  InputNormalizationError,
  InputNormalizationWarning
>;

export function normalizeRecords(
  definition: TemplateDefinition,
  input: RawInputBatch,
): NormalizeRecordsResult {
  const prepared = prepareRows(definition, input);
  if (!prepared.ok) return prepared;

  const errors: InputNormalizationError[] = [];
  const warnings: InputNormalizationWarning[] = [...prepared.warnings];
  const records: RecordData[] = [];
  const origins: RecordOrigin[] = [];

  for (const row of prepared.rows) {
    const errorCount = errors.length;
    const record = normalizeRow(definition, row.value, row.origin, errors, warnings);
    if (errors.length === errorCount && record !== undefined) {
      records.push(record);
      origins.push(row.origin);
    }
  }

  if (prepared.rows.length === 0) errors.push({ code: 'NoInputRecords' });
  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors as [InputNormalizationError, ...InputNormalizationError[]],
      warnings,
    };
  }
  return { ok: true, value: { records, origins }, warnings };
}

type PreparedRowsResult =
  | {
      readonly ok: true;
      readonly rows: readonly PreparedRow[];
      readonly warnings: readonly InputNormalizationWarning[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly [InputNormalizationError, ...InputNormalizationError[]];
      readonly warnings: readonly InputNormalizationWarning[];
    };

interface PreparedRow {
  readonly value: unknown;
  readonly origin: RecordOrigin;
}

function prepareRows(definition: TemplateDefinition, input: RawInputBatch): PreparedRowsResult {
  if (input.kind === 'object-rows') {
    if (!Array.isArray(input.rows)) {
      return {
        ok: false,
        errors: [{ code: 'InvalidInputShape', reason: 'ExpectedRowsArray' }],
        warnings: [],
      };
    }
    return {
      ok: true,
      rows: input.rows.map((value, inputRowIndex) => ({
        value,
        origin: { inputRowIndex, sourceRowNumber: inputRowIndex + 1 },
      })),
      warnings: [],
    };
  }
  return prepareTabularRows(definition, input);
}

function prepareTabularRows(
  definition: TemplateDefinition,
  input: TabularInput,
): PreparedRowsResult {
  if (input.origins !== undefined && input.origins.length !== input.rows.length) {
    return {
      ok: false,
      errors: [{ code: 'InvalidInputShape', reason: 'InvalidOriginCount' }],
      warnings: [],
    };
  }

  const errors: InputNormalizationError[] = [];
  const positionsByName = new Map<string, number[]>();
  input.columns.forEach((column, index) => {
    const positions = positionsByName.get(column) ?? [];
    positions.push(index + 1);
    positionsByName.set(column, positions);
  });
  for (const [fieldName, positions] of positionsByName) {
    if (positions.length > 1) {
      errors.push({
        code: 'DuplicateInputField',
        fieldName,
        columnNumbers: positions as [number, number, ...number[]],
      });
    }
  }
  for (const field of definition.fields) {
    if (!positionsByName.has(field.name)) {
      errors.push({ code: 'MissingInputField', fieldName: field.name });
    }
  }
  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors as [InputNormalizationError, ...InputNormalizationError[]],
      warnings: [],
    };
  }

  const rows: PreparedRow[] = [];
  const emptySourceRows: number[] = [];
  let ignoredCount = 0;
  for (const [inputRowIndex, cells] of input.rows.entries()) {
    const origin = createRecordOrigin(inputRowIndex, input.origins?.[inputRowIndex]);
    if (cells.every(isEmptyTabularCell)) {
      ignoredCount += 1;
      if (origin.sourceRowNumber !== undefined) emptySourceRows.push(origin.sourceRowNumber);
      continue;
    }
    const value: Record<string, unknown> = {};
    input.columns.forEach((column, columnIndex) => {
      value[column] = cells[columnIndex];
    });
    rows.push({ value, origin });
  }

  const firstOrigin = input.origins?.[0];
  const warnings: InputNormalizationWarning[] =
    ignoredCount === 0
      ? []
      : [
          {
            code: 'EmptyInputRowsIgnored',
            rowCount: ignoredCount,
            ...(emptySourceRows.length === 0 ? {} : { sourceRowNumbers: emptySourceRows }),
            ...(firstOrigin?.sheetName === undefined ? {} : { sheetName: firstOrigin.sheetName }),
          },
        ];
  return { ok: true, rows, warnings };
}

function normalizeRow(
  definition: TemplateDefinition,
  candidate: unknown,
  origin: RecordOrigin,
  errors: InputNormalizationError[],
  warnings: InputNormalizationWarning[],
): RecordData | undefined {
  const location = toLocation(origin);
  if (!isPlainRecord(candidate)) {
    errors.push({ code: 'InvalidInputShape', reason: 'ExpectedRowObject', location });
    return undefined;
  }

  const fieldNames = new Set(definition.fields.map((field) => field.name));
  const extras = Object.keys(candidate).filter((name) => !fieldNames.has(name));
  if (extras.length > 0) {
    warnings.push({ code: 'ExtraInputFieldsIgnored', fieldNames: extras, location });
  }

  const record: Record<string, ScalarValue | CollectionData> = {};
  for (const field of definition.fields) {
    if (!Object.hasOwn(candidate, field.name)) {
      errors.push({ code: 'MissingInputField', fieldName: field.name, location });
      continue;
    }
    const value = candidate[field.name];
    if (field.kind === 'scalar') {
      const normalized = normalizeScalar(
        field,
        value,
        {
          ...location,
          path: [field.name],
        },
        errors,
      );
      if (normalized.accepted) record[field.name] = normalized.value;
    } else {
      const normalized = normalizeCollection(field, value, origin, errors);
      if (normalized !== undefined) record[field.name] = normalized;
    }
  }
  return record;
}

function normalizeCollection(
  field: CollectionFieldDefinition,
  value: unknown,
  origin: RecordOrigin,
  errors: InputNormalizationError[],
): CollectionData | undefined {
  const rootLocation: InputDiagnosticLocation = { ...toLocation(origin), path: [field.name] };
  if (!Array.isArray(value)) {
    errors.push({
      code: 'InvalidCollectionValue',
      reason: 'ExpectedArray',
      receivedType: inputValueType(value),
      location: rootLocation,
    });
    return undefined;
  }

  const items: CollectionItemData[] = [];
  for (const [itemIndex, candidate] of value.entries()) {
    const itemLocation: InputDiagnosticLocation = {
      ...toLocation(origin),
      path: [field.name, itemIndex],
    };
    if (!isPlainRecord(candidate)) {
      errors.push({
        code: 'InvalidCollectionItem',
        reason: Array.isArray(candidate) ? 'NestedCollection' : 'ExpectedObject',
        receivedType: inputValueType(candidate),
        location: itemLocation,
      });
      continue;
    }
    const item: Record<string, ScalarValue> = {};
    for (const child of field.fields) {
      if (!Object.hasOwn(candidate, child.name)) {
        errors.push({
          code: 'MissingInputField',
          fieldName: child.name,
          location: { ...toLocation(origin), path: [field.name, itemIndex, child.name] },
        });
        continue;
      }
      const childValue = candidate[child.name];
      if (Array.isArray(childValue) || isPlainRecord(childValue)) {
        errors.push({
          code: 'InvalidCollectionItem',
          reason: 'NestedCollection',
          receivedType: inputValueType(childValue),
          location: { ...toLocation(origin), path: [field.name, itemIndex, child.name] },
        });
        continue;
      }
      const normalized = normalizeScalar(
        child,
        childValue,
        { ...toLocation(origin), path: [field.name, itemIndex, child.name] },
        errors,
      );
      if (normalized.accepted) item[child.name] = normalized.value;
    }
    items.push(item);
  }
  return items;
}

type ScalarNormalization =
  | { readonly accepted: true; readonly value: ScalarValue }
  | { readonly accepted: false };

function normalizeScalar(
  field: ScalarFieldDefinition,
  value: unknown,
  location: InputDiagnosticLocation,
  errors: InputNormalizationError[],
): ScalarNormalization {
  if (value === null) return { accepted: true, value: null };
  if (value === undefined) return reject(field, value, 'UndefinedValue', location, errors);

  switch (field.hint.type) {
    case 'string':
      if (typeof value === 'string') return { accepted: true, value };
      if (typeof value === 'number' && Number.isFinite(value)) {
        return { accepted: true, value: String(value) };
      }
      if (typeof value === 'boolean') return { accepted: true, value: String(value) };
      return reject(field, value, 'TypeMismatch', location, errors);
    case 'option':
      return typeof value === 'string'
        ? { accepted: true, value }
        : reject(field, value, 'TypeMismatch', location, errors);
    case 'number':
      if (typeof value === 'number') {
        return Number.isFinite(value)
          ? { accepted: true, value }
          : reject(field, value, 'NonFiniteNumber', location, errors);
      }
      if (typeof value === 'string' && NUMBER_PATTERN.test(value.trim())) {
        const number = Number(value.trim());
        return Number.isFinite(number)
          ? { accepted: true, value: number }
          : reject(field, value, 'NonFiniteNumber', location, errors);
      }
      return reject(field, value, 'InvalidNumber', location, errors);
    case 'boolean':
      if (typeof value === 'boolean') return { accepted: true, value };
      if (typeof value === 'string') {
        const normalized = value.trim().toLocaleLowerCase('en-US');
        if (normalized === 'true') return { accepted: true, value: true };
        if (normalized === 'false') return { accepted: true, value: false };
      }
      return reject(field, value, 'TypeMismatch', location, errors);
    case 'date': {
      const date = normalizeDate(value);
      return date === undefined
        ? reject(field, value, 'InvalidDate', location, errors)
        : { accepted: true, value: date };
    }
    case 'datetime': {
      const date = normalizeDateTime(value);
      return date === undefined
        ? reject(field, value, 'InvalidDateTime', location, errors)
        : { accepted: true, value: date };
    }
  }
}

function reject(
  field: ScalarFieldDefinition,
  value: unknown,
  reason: Extract<InputNormalizationError, { code: 'InvalidInputValue' }>['reason'],
  location: InputDiagnosticLocation,
  errors: InputNormalizationError[],
): ScalarNormalization {
  errors.push({
    code: 'InvalidInputValue',
    expected: field.hint.type === 'option' ? 'string' : field.hint.type,
    receivedType: inputValueType(value),
    reason,
    location,
  });
  return { accepted: false };
}

function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const match = DATE_PATTERN.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

function normalizeDateTime(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const match = DATETIME_PATTERN.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');
  const millisecond = Number((match[7] ?? '').padEnd(3, '0') || '0');
  const zone = match[8];
  const calendarValue = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    calendarValue.getUTCFullYear() !== year ||
    calendarValue.getUTCMonth() !== month - 1 ||
    calendarValue.getUTCDate() !== day ||
    calendarValue.getUTCHours() !== hour ||
    calendarValue.getUTCMinutes() !== minute ||
    calendarValue.getUTCSeconds() !== second ||
    calendarValue.getUTCMilliseconds() !== millisecond
  )
    return undefined;
  if (zone !== undefined) {
    if (zone !== 'Z') {
      const [offsetHour, offsetMinute] = zone.slice(1).split(':').map(Number);
      if (
        offsetHour === undefined ||
        offsetMinute === undefined ||
        offsetHour > 23 ||
        offsetMinute > 59
      )
        return undefined;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second
    ? date
    : undefined;
}

function createRecordOrigin(index: number, origin: InputRowOrigin | undefined): RecordOrigin {
  return {
    inputRowIndex: index,
    ...(origin?.sourceRowNumber === undefined ? {} : { sourceRowNumber: origin.sourceRowNumber }),
    ...(origin?.sheetName === undefined ? {} : { sheetName: origin.sheetName }),
  };
}

function toLocation(origin: RecordOrigin): InputDiagnosticLocation {
  return {
    inputRowIndex: origin.inputRowIndex,
    ...(origin.sourceRowNumber === undefined ? {} : { sourceRowNumber: origin.sourceRowNumber }),
    ...(origin.sheetName === undefined ? {} : { sheetName: origin.sheetName }),
  };
}

function isEmptyTabularCell(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inputValueType(value: unknown): InputValueType {
  if (value === null) return 'null';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}
