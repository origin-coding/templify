import type {
  FieldHint,
  InputRowOrigin,
  ScalarFieldDefinition,
  StageResult,
  TabularInput,
  TemplateDefinition,
} from '@templify/core';
import {
  cellValueAsPrimitive,
  isDurationValue,
  isErrorValue,
  isFormulaValue,
} from '@office-kit/xlsx/cell';
import { fromArrayBuffer, loadWorkbook } from '@office-kit/xlsx/io';
import { getCellDate } from '@office-kit/xlsx/styles';
import type { Workbook } from '@office-kit/xlsx/workbook';
import { getCell, getValueExtent } from '@office-kit/xlsx/worksheet';
import type { Worksheet } from '@office-kit/xlsx/worksheet';
import {
  PARENT_ID_COLUMN,
  RECORD_ID_COLUMN,
  validateXlsxDefinition,
  xlsxCollections,
  type XlsxTemplateError,
} from './xlsx-protocol';

export interface ParseXlsxInputOptions {
  readonly sheet?: string;
}

export type XlsxInputError =
  | XlsxTemplateError
  | { readonly code: 'InvalidXlsx'; readonly reason: string }
  | { readonly code: 'MissingXlsxSheet'; readonly sheetName: string }
  | { readonly code: 'MissingXlsxHeader'; readonly sheetName: string }
  | {
      readonly code: 'InvalidXlsxHeader';
      readonly sheetName: string;
      readonly columnNumber: number;
    }
  | {
      readonly code: 'DuplicateXlsxHeader';
      readonly sheetName: string;
      readonly fieldName: string;
      readonly columnNumbers: readonly [number, number];
    }
  | { readonly code: 'MissingXlsxField'; readonly sheetName: string; readonly fieldName: string }
  | { readonly code: 'XlsxRootCollectionCollision'; readonly sheetName: string }
  | {
      readonly code: 'InvalidXlsxCell';
      readonly sheetName: string;
      readonly rowNumber: number;
      readonly columnNumber: number;
      readonly reason:
        | 'MissingFormulaCache'
        | 'FormulaError'
        | 'CellError'
        | 'UnsupportedCellValue';
    }
  | {
      readonly code: 'InvalidXlsxRecordId';
      readonly sheetName: string;
      readonly rowNumber: number;
      readonly columnNumber: number;
    }
  | {
      readonly code: 'DuplicateXlsxRecordId';
      readonly sheetName: string;
      readonly rowNumber: number;
      readonly recordId: string;
    }
  | {
      readonly code: 'UnknownXlsxParentId';
      readonly sheetName: string;
      readonly rowNumber: number;
      readonly parentId: string;
    };

export type XlsxInputWarning =
  | { readonly code: 'ExtraXlsxSheetsIgnored'; readonly sheetNames: readonly string[] }
  | {
      readonly code: 'ExtraXlsxColumnsIgnored';
      readonly sheetName: string;
      readonly fieldNames: readonly string[];
    };

interface SheetRow {
  readonly number: number;
  readonly values: readonly unknown[];
}

interface ParsedSheet {
  readonly name: string;
  readonly worksheet: Worksheet;
  readonly columns: readonly string[];
  readonly positions: ReadonlyMap<string, number>;
  readonly rows: readonly SheetRow[];
}

class XlsxFailure extends Error {
  readonly issue: XlsxInputError;

  constructor(issue: XlsxInputError) {
    super(issue.code);
    this.issue = issue;
  }
}

export async function parseXlsxInput(
  source: Uint8Array,
  definition: TemplateDefinition,
  options: ParseXlsxInputOptions = {},
): Promise<StageResult<TabularInput, XlsxInputError, XlsxInputWarning>> {
  const definitionError = validateXlsxDefinition(definition);
  if (definitionError) return failure(definitionError);
  try {
    const workbook = await loadWorkbook(fromArrayBuffer(source));
    const rootRef =
      options.sheet !== undefined
        ? workbook.sheets.find(
            (ref) =>
              ref.kind === 'worksheet' &&
              ref.sheet.title === options.sheet &&
              ref.state === 'visible',
          )
        : workbook.sheets.find((ref) => ref.kind === 'worksheet' && ref.state === 'visible');
    if (rootRef?.kind !== 'worksheet') {
      return failure({
        code: 'MissingXlsxSheet',
        sheetName: options.sheet ?? '(first visible worksheet)',
      });
    }

    const collections = xlsxCollections(definition);
    if (
      collections.some(
        (collection) =>
          collection.name.toLocaleLowerCase('en-US') ===
          rootRef.sheet.title.toLocaleLowerCase('en-US'),
      )
    ) {
      return failure({ code: 'XlsxRootCollectionCollision', sheetName: rootRef.sheet.title });
    }
    const scalars = definition.fields.filter(
      (field): field is ScalarFieldDefinition => field.kind === 'scalar',
    );
    const root = parseSheet(
      workbook,
      rootRef.sheet,
      [
        ...(collections.length === 0 ? [] : [RECORD_ID_COLUMN]),
        ...scalars.map((field) => field.name),
      ],
      new Map(scalars.map((field) => [field.name, field.hint])),
    );

    if (collections.length === 0) {
      return {
        ok: true,
        value: {
          kind: 'tabular',
          columns: root.columns,
          rows: root.rows.map((row) => row.values),
          origins: root.rows.map((row) => ({ sheetName: root.name, sourceRowNumber: row.number })),
        },
        warnings: [],
      };
    }

    const warnings: XlsxInputWarning[] = [];
    const rootIds = new Map<string, number>();
    const rootRows: SheetRow[] = [];
    for (const row of root.rows) {
      if (isEmptyRow(row.values)) continue;
      const recordId = requireId(root, row, RECORD_ID_COLUMN);
      if (rootIds.has(recordId)) {
        throw new XlsxFailure({
          code: 'DuplicateXlsxRecordId',
          sheetName: root.name,
          rowNumber: row.number,
          recordId,
        });
      }
      rootIds.set(recordId, rootRows.length);
      rootRows.push(row);
    }

    const grouped = new Map<
      string,
      { values: Record<string, unknown>[]; origins: InputRowOrigin[] }[]
    >();
    for (const collection of collections) {
      const ref = workbook.sheets.find(
        (item) =>
          item.kind === 'worksheet' &&
          item.sheet.title === collection.name &&
          item.state === 'visible',
      );
      if (ref?.kind !== 'worksheet') {
        throw new XlsxFailure({ code: 'MissingXlsxSheet', sheetName: collection.name });
      }
      const child = parseSheet(
        workbook,
        ref.sheet,
        [PARENT_ID_COLUMN, ...collection.fields.map((field) => field.name)],
        new Map(collection.fields.map((field) => [field.name, field.hint])),
      );
      const extras = child.columns.filter(
        (name) =>
          name !== PARENT_ID_COLUMN && !collection.fields.some((field) => field.name === name),
      );
      if (extras.length > 0) {
        warnings.push({
          code: 'ExtraXlsxColumnsIgnored',
          sheetName: child.name,
          fieldNames: extras,
        });
      }
      const perRoot = rootRows.map(() => ({
        values: [] as Record<string, unknown>[],
        origins: [] as InputRowOrigin[],
      }));
      const sourceColumnNumbers = Object.fromEntries(
        collection.fields.map((field) => [field.name, child.positions.get(field.name)!]),
      );
      for (const row of child.rows) {
        if (isEmptyRow(row.values)) continue;
        const parentId = requireId(child, row, PARENT_ID_COLUMN);
        const rootIndex = rootIds.get(parentId);
        if (rootIndex === undefined) {
          throw new XlsxFailure({
            code: 'UnknownXlsxParentId',
            sheetName: child.name,
            rowNumber: row.number,
            parentId,
          });
        }
        const value: Record<string, unknown> = {};
        for (const field of collection.fields) {
          value[field.name] = row.values[child.positions.get(field.name)! - 1];
        }
        perRoot[rootIndex]!.values.push(value);
        perRoot[rootIndex]!.origins.push({
          sheetName: child.name,
          sourceRowNumber: row.number,
          sourceColumnNumbers,
        });
      }
      grouped.set(collection.name, perRoot);
    }

    const usedSheets = new Set([root.name, ...collections.map((collection) => collection.name)]);
    const extras = workbook.sheets
      .filter(
        (ref) =>
          ref.kind === 'worksheet' && ref.state === 'visible' && !usedSheets.has(ref.sheet.title),
      )
      .map((ref) => ref.sheet.title);
    if (extras.length > 0) warnings.push({ code: 'ExtraXlsxSheetsIgnored', sheetNames: extras });

    const rootColumns = root.columns.filter((name) => name !== RECORD_ID_COLUMN);
    return {
      ok: true,
      value: {
        kind: 'tabular',
        columns: [...rootColumns, ...collections.map((collection) => collection.name)],
        rows: rootRows.map((row, index) => [
          ...rootColumns.map((name) => row.values[root.positions.get(name)! - 1]),
          ...collections.map((collection) => grouped.get(collection.name)![index]!.values),
        ]),
        origins: rootRows.map((row) => ({ sheetName: root.name, sourceRowNumber: row.number })),
        collectionOrigins: rootRows.map((_, index) =>
          Object.fromEntries(
            collections.map((collection) => [
              collection.name,
              grouped.get(collection.name)![index]!.origins,
            ]),
          ),
        ),
      },
      warnings,
    };
  } catch (cause) {
    if (cause instanceof XlsxFailure) return failure(cause.issue);
    return failure({
      code: 'InvalidXlsx',
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

function parseSheet(
  workbook: Workbook,
  sheet: Worksheet,
  required: readonly string[],
  hints: ReadonlyMap<string, FieldHint>,
): ParsedSheet {
  const extent = getValueExtent(sheet);
  if (extent === undefined || extent.maxCol === 0) {
    throw new XlsxFailure({ code: 'MissingXlsxHeader', sheetName: sheet.title });
  }
  const columns: string[] = [];
  const positions = new Map<string, number>();
  for (let col = 1; col <= extent.maxCol; col += 1) {
    const value = getCell(sheet, 1, col)?.value;
    if (typeof value !== 'string' || value.length === 0) {
      throw new XlsxFailure({
        code: 'InvalidXlsxHeader',
        sheetName: sheet.title,
        columnNumber: col,
      });
    }
    const prior = positions.get(value);
    if (prior !== undefined) {
      throw new XlsxFailure({
        code: 'DuplicateXlsxHeader',
        sheetName: sheet.title,
        fieldName: value,
        columnNumbers: [prior, col],
      });
    }
    columns.push(value);
    positions.set(value, col);
  }
  for (const name of required) {
    if (!positions.has(name)) {
      throw new XlsxFailure({ code: 'MissingXlsxField', sheetName: sheet.title, fieldName: name });
    }
  }
  const requiredNames = new Set(required);
  const rows: SheetRow[] = [];
  for (let row = 2; row <= extent.maxRow; row += 1) {
    rows.push({
      number: row,
      values: columns.map((name, index) =>
        requiredNames.has(name) ? readCell(workbook, sheet, row, index + 1, hints.get(name)) : null,
      ),
    });
  }
  return { name: sheet.title, worksheet: sheet, columns, positions, rows };
}

function readCell(
  workbook: Workbook,
  sheet: Worksheet,
  row: number,
  col: number,
  hint: FieldHint | undefined,
): unknown {
  const cell = getCell(sheet, row, col);
  if (cell === undefined || cell.value === null) return null;
  const value = cell.value;
  if (isFormulaValue(value)) {
    if (value.cachedValueType === 'error') {
      throw cellFailure(sheet, row, col, 'FormulaError');
    }
    if (value.cachedValue === undefined) {
      throw cellFailure(sheet, row, col, 'MissingFormulaCache');
    }
  } else if (isErrorValue(value)) {
    throw cellFailure(sheet, row, col, 'CellError');
  }
  if (hint?.type === 'date' || hint?.type === 'datetime') {
    const date = getCellDate(workbook, cell);
    if (date !== undefined) return date;
  }
  if (isDurationValue(value)) {
    throw cellFailure(sheet, row, col, 'UnsupportedCellValue');
  }
  return cellValueAsPrimitive(value);
}

function requireId(sheet: ParsedSheet, row: SheetRow, column: string): string {
  const position = sheet.positions.get(column)!;
  const value = row.values[position - 1];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new XlsxFailure({
      code: 'InvalidXlsxRecordId',
      sheetName: sheet.name,
      rowNumber: row.number,
      columnNumber: position,
    });
  }
  const cell = getCell(sheet.worksheet, row.number, position);
  if (cell !== undefined && isFormulaValue(cell.value)) {
    throw new XlsxFailure({
      code: 'InvalidXlsxRecordId',
      sheetName: sheet.name,
      rowNumber: row.number,
      columnNumber: position,
    });
  }
  return value;
}

function isEmptyRow(values: readonly unknown[]): boolean {
  return values.every((value) => value === null || value === '');
}

function cellFailure(
  sheet: Worksheet,
  rowNumber: number,
  columnNumber: number,
  reason: Extract<XlsxInputError, { code: 'InvalidXlsxCell' }>['reason'],
): XlsxFailure {
  return new XlsxFailure({
    code: 'InvalidXlsxCell',
    sheetName: sheet.title,
    rowNumber,
    columnNumber,
    reason,
  });
}

function failure(error: XlsxInputError): StageResult<never, XlsxInputError, XlsxInputWarning> {
  return { ok: false, errors: [error], warnings: [] };
}
