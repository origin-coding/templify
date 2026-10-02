import { fromArrayBuffer, loadWorkbook } from '@office-kit/xlsx/io';

/** Visible worksheets eligible for selection as a root input sheet. */
export async function listXlsxSheets(source: Uint8Array): Promise<readonly string[]> {
  const workbook = await loadWorkbook(fromArrayBuffer(source));
  return workbook.sheets.flatMap((ref) =>
    ref.kind === 'worksheet' && ref.state === 'visible' ? [ref.sheet.title] : [],
  );
}
