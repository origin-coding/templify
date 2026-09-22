import type { StageResult } from '@/stage-result.js';
import type { TabularInput } from '@/input/raw-input.js';

export type TabularInputFormat = 'csv' | 'xlsx';

export interface TabularInputParser<
  TFormat extends TabularInputFormat,
  TSource = Uint8Array,
  TError = unknown,
  TWarning = never,
> {
  readonly format: TFormat;
  parse(source: TSource): Promise<StageResult<TabularInput, TError, TWarning>>;
}

export type CsvInputParser<
  TSource = Uint8Array,
  TError = unknown,
  TWarning = never,
> = TabularInputParser<'csv', TSource, TError, TWarning>;

export type ExcelInputParser<
  TSource = Uint8Array,
  TError = unknown,
  TWarning = never,
> = TabularInputParser<'xlsx', TSource, TError, TWarning>;
