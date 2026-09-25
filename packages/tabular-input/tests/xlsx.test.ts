import { describe, expect, it } from 'vitest';
import { makeFormula } from '@office-kit/xlsx/cell';
import { fromArrayBuffer, loadWorkbook, workbookToBytes } from '@office-kit/xlsx/io';
import { setCellNumberFormat } from '@office-kit/xlsx/styles';
import { addWorksheet, createWorkbook } from '@office-kit/xlsx/workbook';
import { appendRow, getCell, setCell } from '@office-kit/xlsx/worksheet';
import { normalizeRecords, type TemplateDefinition } from '@templify/core';
import { createXlsxTemplate, detectInputFileFormat, parseXlsxInput } from '../src/index';

const scalarDefinition: TemplateDefinition = {
  version: 1,
  kind: 'docx',
  fields: [
    { kind: 'scalar', name: 'name', hint: { type: 'string' } },
    { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
    { kind: 'scalar', name: 'day', hint: { type: 'date' } },
  ],
};

const collectionDefinition: TemplateDefinition = {
  version: 1,
  kind: 'docx',
  fields: [
    { kind: 'scalar', name: 'name', hint: { type: 'string' } },
    {
      kind: 'collection',
      name: 'lineItems',
      fields: [
        { kind: 'scalar', name: 'sku', hint: { type: 'string' } },
        { kind: 'scalar', name: 'qty', hint: { type: 'number' } },
      ],
    },
    {
      kind: 'collection',
      name: 'payments',
      fields: [
        { kind: 'scalar', name: 'method', hint: { type: 'string' } },
        { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
      ],
    },
  ],
};

describe('XLSX input adapter', () => {
  it('routes file extensions and rejects legacy Excel formats explicitly', () => {
    expect(detectInputFileFormat('records.CSV')).toEqual({ kind: 'supported', format: 'csv' });
    expect(detectInputFileFormat('records.XLSX')).toEqual({ kind: 'supported', format: 'xlsx' });
    expect(detectInputFileFormat('records.xls')).toEqual({
      kind: 'unsupported-excel',
      extension: '.xls',
    });
    expect(detectInputFileFormat('records.xlsm')).toEqual({
      kind: 'unsupported-excel',
      extension: '.xlsm',
    });
    expect(detectInputFileFormat('records.bin')).toEqual({ kind: 'unknown', extension: '.bin' });
  });

  it('ignores extra columns, including their formula errors and data-only rows', async () => {
    const workbook = createWorkbook();
    const sheet = addWorksheet(workbook, 'Records');
    appendRow(sheet, ['name', 'amount', 'day', 'unused']);
    appendRow(sheet, [
      'Alice',
      2,
      '2024-01-01',
      makeFormula('1/0', { cachedValue: '#DIV/0!', cachedValueType: 'error' }),
    ]);
    appendRow(sheet, [null, null, null, 'extra only']);
    const parsed = await parseXlsxInput(await workbookToBytes(workbook), scalarDefinition);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const normalized = normalizeRecords(scalarDefinition, parsed.value);
    expect(normalized).toMatchObject({
      ok: true,
      value: { records: [{ name: 'Alice', amount: 2 }] },
    });
    expect(normalized.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EmptyInputRowsIgnored', rowCount: 1 }),
      ]),
    );
  });

  it('supports a collection-only template whose collection is named Records', async () => {
    const definition: TemplateDefinition = {
      version: 1,
      kind: 'docx',
      fields: [
        {
          kind: 'collection',
          name: 'Records',
          fields: [{ kind: 'scalar', name: 'value', hint: { type: 'string' } }],
        },
      ],
    };
    const template = await createXlsxTemplate(definition);
    if (!template.ok) throw new Error(JSON.stringify(template.errors));
    const workbook = await loadWorkbook(fromArrayBuffer(template.value));
    expect(workbook.sheets.map((ref) => ref.sheet.title)).toEqual(['Records 2', 'Records']);
    const root = workbook.sheets[0]!.sheet;
    const child = workbook.sheets[1]!.sheet;
    if (!('rows' in root) || !('rows' in child)) throw new Error('expected worksheets');
    appendRow(root, ['r1']);
    appendRow(child, ['r1', 'Hello']);
    const parsed = await parseXlsxInput(await workbookToBytes(workbook), definition);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    expect(normalizeRecords(definition, parsed.value)).toMatchObject({
      ok: true,
      value: { records: [{ Records: [{ value: 'Hello' }] }] },
    });
  });

  it('exports a scalar workbook and reads native cells and cached formula values', async () => {
    const generated = await createXlsxTemplate(scalarDefinition);
    if (!generated.ok) throw new Error(JSON.stringify(generated.errors));
    const workbook = await loadWorkbook(fromArrayBuffer(generated.value));
    expect(workbook.sheets.map((ref) => ref.sheet.title)).toEqual(['Records']);
    const sheet = workbook.sheets[0]!.sheet;
    if (!('rows' in sheet)) throw new Error('expected worksheet');
    expect([1, 2, 3].map((col) => getCell(sheet, 1, col)?.value)).toEqual([
      'name',
      'amount',
      'day',
    ]);
    setCell(sheet, 2, 1, '00123');
    setCell(sheet, 2, 2, makeFormula('40+2', { cachedValue: 42 }));
    setCellNumberFormat(
      workbook,
      setCell(sheet, 2, 3, makeFormula('DATE(2024,3,1)', { cachedValue: 45352 })),
      'yyyy-mm-dd',
    );
    const parsed = await parseXlsxInput(await workbookToBytes(workbook), scalarDefinition);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        rows: [['00123', 42, expect.any(Date)]],
        origins: [{ sheetName: 'Records', sourceRowNumber: 2 }],
      },
    });
    if (!parsed.ok) return;
    expect(normalizeRecords(scalarDefinition, parsed.value)).toMatchObject({
      ok: true,
      value: { records: [{ name: '00123', amount: 42, day: expect.any(Date) }] },
    });
  });

  it('rejects formulas without cache and formula errors with cell position', async () => {
    const workbook = createWorkbook();
    const sheet = addWorksheet(workbook, 'Data');
    appendRow(sheet, ['name', 'amount', 'day']);
    appendRow(sheet, ['Alice', makeFormula('1+1'), '2024-01-01']);
    expect(await parseXlsxInput(await workbookToBytes(workbook), scalarDefinition)).toMatchObject({
      ok: false,
      errors: [
        {
          code: 'InvalidXlsxCell',
          sheetName: 'Data',
          rowNumber: 2,
          columnNumber: 2,
          reason: 'MissingFormulaCache',
        },
      ],
    });
    setCell(sheet, 2, 2, makeFormula('1/0', { cachedValue: '#DIV/0!', cachedValueType: 'error' }));
    expect(await parseXlsxInput(await workbookToBytes(workbook), scalarDefinition)).toMatchObject({
      ok: false,
      errors: [{ code: 'InvalidXlsxCell', reason: 'FormulaError' }],
    });
  });

  it('joins multiple named collections to stable IDs and preserves child positions', async () => {
    const generated = await createXlsxTemplate(collectionDefinition);
    if (!generated.ok) throw new Error(JSON.stringify(generated.errors));
    const workbook = await loadWorkbook(fromArrayBuffer(generated.value));
    expect(workbook.sheets.map((ref) => ref.sheet.title)).toEqual([
      'Records',
      'lineItems',
      'payments',
    ]);
    const root = workbook.sheets[0]!.sheet;
    const items = workbook.sheets[1]!.sheet;
    const payments = workbook.sheets[2]!.sheet;
    if (!('rows' in root) || !('rows' in items) || !('rows' in payments)) {
      throw new Error('expected worksheets');
    }
    appendRow(root, ['r1', 'Alice']);
    appendRow(root, ['r2', 'Bob']);
    appendRow(items, ['r2', 'SKU-B', 3]);
    appendRow(items, ['r1', 'SKU-A', 2]);
    appendRow(payments, ['r1', 'Cash', 12]);
    const bytes = await workbookToBytes(workbook);
    const parsed = await parseXlsxInput(bytes, collectionDefinition);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        columns: ['name', 'lineItems', 'payments'],
        rows: [
          ['Alice', [{ sku: 'SKU-A', qty: 2 }], [{ method: 'Cash', amount: 12 }]],
          ['Bob', [{ sku: 'SKU-B', qty: 3 }], []],
        ],
      },
    });
    if (!parsed.ok) return;
    expect(normalizeRecords(collectionDefinition, parsed.value)).toMatchObject({
      ok: true,
      value: { records: [{ name: 'Alice' }, { name: 'Bob' }] },
    });

    setCell(items, 3, 3, 'bad');
    const invalid = await parseXlsxInput(await workbookToBytes(workbook), collectionDefinition);
    if (!invalid.ok) throw new Error(JSON.stringify(invalid.errors));
    expect(normalizeRecords(collectionDefinition, invalid.value)).toMatchObject({
      ok: false,
      errors: [
        {
          code: 'InvalidInputValue',
          location: {
            sheetName: 'lineItems',
            sourceRowNumber: 3,
            sourceColumnNumber: 3,
            path: ['lineItems', 0, 'qty'],
          },
        },
      ],
    });
  });

  it('supports selecting a root sheet after another worksheet', async () => {
    const workbook = createWorkbook();
    appendRow(addWorksheet(workbook, 'Notes'), ['ignore']);
    const root = addWorksheet(workbook, 'Input');
    appendRow(root, ['__templify_id', 'name']);
    appendRow(root, ['r1', 'Alice']);
    const items = addWorksheet(workbook, 'lineItems');
    appendRow(items, ['__templify_parent_id', 'sku', 'qty']);
    const payments = addWorksheet(workbook, 'payments');
    appendRow(payments, ['__templify_parent_id', 'method', 'amount']);
    const parsed = await parseXlsxInput(await workbookToBytes(workbook), collectionDefinition, {
      sheet: 'Input',
    });
    expect(parsed).toMatchObject({
      ok: true,
      warnings: [{ code: 'ExtraXlsxSheetsIgnored', sheetNames: ['Notes'] }],
      value: { rows: [['Alice', [], []]] },
    });
  });

  it('reports duplicate IDs, unknown parents, and missing collection sheets', async () => {
    const workbook = createWorkbook();
    const root = addWorksheet(workbook, 'Records');
    appendRow(root, ['__templify_id', 'name']);
    appendRow(root, ['r1', 'Alice']);
    appendRow(root, ['r1', 'Bob']);
    const items = addWorksheet(workbook, 'lineItems');
    appendRow(items, ['__templify_parent_id', 'sku', 'qty']);
    appendRow(items, ['missing', 'SKU', 1]);
    expect(
      await parseXlsxInput(await workbookToBytes(workbook), collectionDefinition),
    ).toMatchObject({
      ok: false,
      errors: [{ code: 'DuplicateXlsxRecordId', recordId: 'r1', rowNumber: 3 }],
    });
    setCell(root, 3, 1, 'r2');
    expect(
      await parseXlsxInput(await workbookToBytes(workbook), collectionDefinition),
    ).toMatchObject({
      ok: false,
      errors: [{ code: 'UnknownXlsxParentId', parentId: 'missing', sheetName: 'lineItems' }],
    });
    setCell(items, 2, 1, 'r1');
    expect(
      await parseXlsxInput(await workbookToBytes(workbook), collectionDefinition),
    ).toMatchObject({
      ok: false,
      errors: [{ code: 'MissingXlsxSheet', sheetName: 'payments' }],
    });
  });

  it('rejects formula IDs, reserved fields, and invalid collection sheet names', async () => {
    const workbook = createWorkbook();
    const root = addWorksheet(workbook, 'Records');
    appendRow(root, ['__templify_id', 'name']);
    appendRow(root, [makeFormula('1', { cachedValue: 'r1' }), 'Alice']);
    appendRow(addWorksheet(workbook, 'lineItems'), ['__templify_parent_id', 'sku', 'qty']);
    appendRow(addWorksheet(workbook, 'payments'), ['__templify_parent_id', 'method', 'amount']);
    expect(
      await parseXlsxInput(await workbookToBytes(workbook), collectionDefinition),
    ).toMatchObject({
      ok: false,
      errors: [{ code: 'InvalidXlsxRecordId', sheetName: 'Records', rowNumber: 2 }],
    });
    expect(
      await createXlsxTemplate({
        ...collectionDefinition,
        fields: [
          ...collectionDefinition.fields,
          { kind: 'scalar', name: '__templify_id', hint: { type: 'string' } },
        ],
      }),
    ).toMatchObject({ ok: false, errors: [{ code: 'ReservedXlsxFieldName' }] });
    expect(
      await createXlsxTemplate({
        ...collectionDefinition,
        fields: [{ kind: 'collection', name: 'bad/name', fields: [] }],
      }),
    ).toMatchObject({ ok: false, errors: [{ code: 'InvalidXlsxSheetName' }] });
  });
});
