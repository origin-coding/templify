import type { StageResult } from '@/stage-result';
import type { TabularInput } from '@/input/raw-input';
import type { TemplateDefinition } from '@/template/template-definition';

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

export interface ExcelInputParser<TSource = Uint8Array, TError = unknown, TWarning = never> {
  readonly format: 'xlsx';
  parse(
    source: TSource,
    definition: TemplateDefinition,
  ): Promise<StageResult<TabularInput, TError, TWarning>>;
}
