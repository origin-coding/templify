import { parse } from 'csv-parse/sync';
import type { StageResult, TabularInput } from '@templify/core';

export type CsvInputEncoding = 'utf8' | 'gbk';

export interface ParseCsvInputOptions {
  readonly encoding?: CsvInputEncoding;
}

export type CsvInputError =
  | { readonly code: 'InvalidCsvEncoding'; readonly encoding: CsvInputEncoding }
  | {
      readonly code: 'InvalidCsv';
      readonly reason: string;
      readonly sourceRowNumber?: number;
    }
  | { readonly code: 'MissingCsvHeader' }
  | { readonly code: 'EmptyCsvHeader'; readonly columnNumber: number };

interface ParsedCsvRecord {
  readonly record: readonly string[];
  readonly info: { readonly lines: number; readonly empty_lines: number };
}

export function parseCsvInput(
  source: Uint8Array,
  options: ParseCsvInputOptions = {},
): StageResult<TabularInput, CsvInputError> {
  const encoding = options.encoding ?? 'utf8';
  if (encoding === 'gbk' && source[0] === 0xef && source[1] === 0xbb && source[2] === 0xbf) {
    return failure({ code: 'InvalidCsvEncoding', encoding });
  }
  let content: string;
  try {
    content = new TextDecoder(encoding === 'utf8' ? 'utf-8' : 'gbk', { fatal: true }).decode(
      source,
    );
  } catch {
    return failure({ code: 'InvalidCsvEncoding', encoding });
  }

  let parsed: readonly ParsedCsvRecord[];
  try {
    parsed = parse(content, {
      bom: true,
      skip_empty_lines: true,
      info: true,
      columns: false,
    }) as unknown as ParsedCsvRecord[];
  } catch (cause) {
    const detail = cause as { code?: unknown; message?: unknown; lines?: unknown };
    return failure({
      code: 'InvalidCsv',
      reason: typeof detail.code === 'string' ? detail.code : String(detail.message ?? cause),
      ...(typeof detail.lines === 'number' ? { sourceRowNumber: detail.lines } : {}),
    });
  }

  const header = parsed[0];
  if (header === undefined) return failure({ code: 'MissingCsvHeader' });
  for (const [index, value] of header.record.entries()) {
    if (value.length === 0) return failure({ code: 'EmptyCsvHeader', columnNumber: index + 1 });
  }
  return {
    ok: true,
    value: {
      kind: 'tabular',
      columns: header.record,
      rows: parsed.slice(1).map((item) => item.record),
      origins: parsed.slice(1).map((item, index) => ({
        sourceRowNumber:
          parsed[index]!.info.lines + item.info.empty_lines - parsed[index]!.info.empty_lines + 1,
      })),
    },
    warnings: [],
  };
}

function failure(error: CsvInputError): StageResult<never, CsvInputError> {
  return { ok: false, errors: [error], warnings: [] };
}
