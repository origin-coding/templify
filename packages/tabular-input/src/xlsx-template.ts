import type { StageResult, TemplateDefinition } from '@templify/core';
import { workbookToBytes } from '@office-kit/xlsx/io';
import { registerCellStyle, setBold } from '@office-kit/xlsx/styles';
import { addWorksheet, createWorkbook } from '@office-kit/xlsx/workbook';
import { appendRow, getCell, setColumnDimension, setFreezePanes } from '@office-kit/xlsx/worksheet';
import type { Workbook } from '@office-kit/xlsx/workbook';
import type { ScalarFieldDefinition } from '@templify/core';
import {
  PARENT_ID_COLUMN,
  RECORD_ID_COLUMN,
  rootSheetName,
  validateXlsxDefinition,
  xlsxCollections,
  type XlsxTemplateError,
} from './xlsx-protocol';

export async function createXlsxTemplate(
  definition: TemplateDefinition,
): Promise<StageResult<Uint8Array, XlsxTemplateError>> {
  const error = validateXlsxDefinition(definition);
  if (error) return { ok: false, errors: [error], warnings: [] };

  try {
    const workbook = createWorkbook();
    const collections = xlsxCollections(definition);
    const scalars = definition.fields.filter(
      (field): field is ScalarFieldDefinition => field.kind === 'scalar',
    );
    addTemplateSheet(
      workbook,
      collections.length === 0 ? 'Records' : rootSheetName(collections),
      collections.length === 0 ? [] : [RECORD_ID_COLUMN],
      scalars,
    );
    for (const collection of collections) {
      addTemplateSheet(workbook, collection.name, [PARENT_ID_COLUMN], collection.fields);
    }
    return { ok: true, value: await workbookToBytes(workbook), warnings: [] };
  } catch (cause) {
    return {
      ok: false,
      errors: [
        {
          code: 'XlsxTemplateFailed',
          reason: cause instanceof Error ? cause.message : String(cause),
        },
      ],
      warnings: [],
    };
  }
}

function addTemplateSheet(
  workbook: Workbook,
  name: string,
  systemColumns: readonly string[],
  fields: readonly ScalarFieldDefinition[],
): void {
  const sheet = addWorksheet(workbook, name);
  const headers = [...systemColumns, ...fields.map((field) => field.name)];
  appendRow(sheet, headers);
  setFreezePanes(sheet, { rows: 1, cols: 0 });
  headers.forEach((_, index) => {
    const col = index + 1;
    const header = getCell(sheet, 1, col);
    if (header) setBold(workbook, header, true);
    const field = fields[index - systemColumns.length];
    const numberFormat =
      index < systemColumns.length || field?.hint.type === 'string' || field?.hint.type === 'option'
        ? '@'
        : field?.hint.type === 'date'
          ? 'yyyy-mm-dd'
          : field?.hint.type === 'datetime'
            ? 'yyyy-mm-dd hh:mm:ss'
            : undefined;
    const style = numberFormat ? registerCellStyle(workbook, { numberFormat }) : undefined;
    setColumnDimension(sheet, col, {
      width: Math.min(40, Math.max(16, headers[index]!.length + 4)),
      ...(style === undefined ? {} : { style }),
    });
  });
}
