import dayjs from 'dayjs';
import zhCn from 'dayjs/locale/zh-cn';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import type { ScalarValue } from '@/input/record-data';
import type { ScalarFieldDefinition } from '@/template/field-definition';
import type { RenderLocale } from './render-options';
import type { ValidatedFieldFormat, ValidatedRenderOptions } from './validated-render-options';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale(zhCn);
dayjs.locale('en');

export interface FieldValueFormatter {
  format(field: ScalarFieldDefinition, value: ScalarValue, fieldPath: readonly string[]): string;
}

export function createFieldValueFormatter(options: ValidatedRenderOptions): FieldValueFormatter {
  const formats = new Map<string, CompiledFormat>();
  for (const rule of options.formats) {
    formats.set(JSON.stringify(rule.path), compileFormat(rule.format));
  }

  return {
    format(field, value, fieldPath) {
      const canonical = formatCanonicalValue(field, value, options.timeZone);
      if (value === null) return canonical;
      const format = formats.get(JSON.stringify(fieldPath));
      if (format === undefined) return canonical;
      switch (format.type) {
        case 'date':
          return dayjs
            .utc(value as Date)
            .locale(toDayjsLocale(format.locale))
            .format(format.pattern);
        case 'datetime':
          return dayjs(value as Date)
            .tz(format.timeZone)
            .locale(toDayjsLocale(format.locale))
            .format(format.pattern);
        case 'number':
          return format.formatter.format(value as number);
        case 'boolean':
          return value ? format.trueText : format.falseText;
      }
    },
  };
}

type CompiledFormat =
  | Exclude<ValidatedFieldFormat, { type: 'number' }>
  | { readonly type: 'number'; readonly formatter: Intl.NumberFormat };

function compileFormat(format: ValidatedFieldFormat): CompiledFormat {
  return format.type === 'number'
    ? { type: 'number', formatter: new Intl.NumberFormat(format.locale, format.options) }
    : format;
}

function formatCanonicalValue(
  field: ScalarFieldDefinition,
  value: ScalarValue,
  timeZone: string,
): string {
  if (value === null) return '';
  switch (field.hint.type) {
    case 'string':
    case 'option':
      if (typeof value !== 'string') throw new TypeError('Expected a normalized string value.');
      return value;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError('Expected a normalized finite number.');
      }
      return String(value);
    case 'boolean':
      if (typeof value !== 'boolean') throw new TypeError('Expected a normalized boolean.');
      return String(value);
    case 'date':
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new TypeError('Expected a normalized date.');
      }
      return dayjs.utc(value).format('YYYY-MM-DD');
    case 'datetime':
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new TypeError('Expected a normalized datetime.');
      }
      return dayjs(value).tz(timeZone).format('YYYY-MM-DD HH:mm:ss');
  }
}

function toDayjsLocale(locale: RenderLocale): string {
  return locale === 'zh-CN' ? 'zh-cn' : 'en';
}
