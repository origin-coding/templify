import { workbookToBytes } from '@office-kit/xlsx/io';
import { addWorksheet, createWorkbook } from '@office-kit/xlsx/workbook';
import { appendRow } from '@office-kit/xlsx/worksheet';

export async function createXlsx(
  sheets: Readonly<Record<string, readonly (readonly (string | number | null)[])[]>>,
): Promise<Uint8Array> {
  const workbook = createWorkbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = addWorksheet(workbook, name);
    for (const row of rows) appendRow(sheet, [...row]);
  }
  return workbookToBytes(workbook);
}
