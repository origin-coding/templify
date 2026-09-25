import path from 'node:path';

export type InputFileFormat = 'csv' | 'xlsx';
export type UnsupportedExcelExtension = '.xls' | '.xlsm' | '.xlsb' | '.xlt' | '.xltx' | '.xltm';

export type InputFileDetection =
  | { readonly kind: 'supported'; readonly format: InputFileFormat }
  | { readonly kind: 'unsupported-excel'; readonly extension: UnsupportedExcelExtension }
  | { readonly kind: 'unknown'; readonly extension: string };

const unsupported = new Set<UnsupportedExcelExtension>([
  '.xls',
  '.xlsm',
  '.xlsb',
  '.xlt',
  '.xltx',
  '.xltm',
]);

export function detectInputFileFormat(fileName: string): InputFileDetection {
  const extension = path.extname(fileName).toLocaleLowerCase('en-US');
  if (extension === '.csv' || extension === '.xlsx') {
    return { kind: 'supported', format: extension.slice(1) as InputFileFormat };
  }
  if (unsupported.has(extension as UnsupportedExcelExtension)) {
    return { kind: 'unsupported-excel', extension: extension as UnsupportedExcelExtension };
  }
  return { kind: 'unknown', extension };
}
