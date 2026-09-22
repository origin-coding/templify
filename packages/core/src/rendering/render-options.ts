export type RenderLocale = 'en' | 'zh-CN';

export type FieldPath =
  | readonly [fieldName: string]
  | readonly [collectionName: string, fieldName: string];

export interface DateFieldFormat {
  readonly type: 'date';
  readonly pattern?: string;
  readonly locale?: RenderLocale;
}

export interface DateTimeFieldFormat {
  readonly type: 'datetime';
  readonly pattern?: string;
  readonly locale?: RenderLocale;
  readonly timeZone?: string;
}

export interface NumberFieldFormat {
  readonly type: 'number';
  readonly locale?: RenderLocale;
  readonly useGrouping?: boolean;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly currency?: string;
  readonly currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
}

export interface BooleanFieldFormat {
  readonly type: 'boolean';
  readonly trueText: string;
  readonly falseText: string;
}

export type FieldFormat =
  | DateFieldFormat
  | DateTimeFieldFormat
  | NumberFieldFormat
  | BooleanFieldFormat;

export interface FieldFormatRule {
  readonly path: FieldPath;
  readonly format: FieldFormat;
}

export interface RenderOptions {
  readonly locale?: RenderLocale;
  /** Uses the runtime's system time zone when omitted. */
  readonly timeZone?: string;
  readonly formats?: readonly FieldFormatRule[];
}
