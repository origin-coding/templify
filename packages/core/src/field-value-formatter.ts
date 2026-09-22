import dayjs from 'dayjs';
import zhCn from 'dayjs/locale/zh-cn.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

import type { DocumentRenderErrorReason } from './errors.js';
import type { FieldDefinition, ScalarFieldDefinition } from './field-definition.js';
import { formatFieldValue } from './format-field-value.js';
import type { PrimitiveValue } from './record-data.js';
import type { RenderLocale, RenderOptions } from './render-options.js';
import { validateRenderOptions } from './validate-render-options.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale(zhCn);
dayjs.locale('en');

type DataPath = readonly (string | number)[];

export interface FieldValueFormatter {
  format(
    field: ScalarFieldDefinition,
    value: PrimitiveValue,
    fieldPath: readonly string[],
    dataPath: DataPath,
    reason: DocumentRenderErrorReason,
  ): string;
}

export function createFieldValueFormatter(
  fields: readonly FieldDefinition[],
  options: RenderOptions = {},
): FieldValueFormatter {
  const formats = validateRenderOptions(fields, options);

  return {
    format(field, value, fieldPath, dataPath, reason) {
      const canonicalValue = formatFieldValue(field, value, dataPath, reason);
      if (value === null) return canonicalValue;

      const format = formats.get(JSON.stringify(fieldPath));
      if (format === undefined) return canonicalValue;

      switch (format.type) {
        case 'date':
          return dayjs
            .utc(value as Date)
            .locale(toDayjsLocale(format.locale))
            .format(format.pattern);

        case 'datetime': {
          const date =
            format.timeZone === undefined
              ? dayjs(value as Date)
              : dayjs(value as Date).tz(format.timeZone);
          return date.locale(toDayjsLocale(format.locale)).format(format.pattern);
        }

        case 'number':
          return format.formatter.format(value as number);

        case 'boolean':
          return value ? format.trueText : format.falseText;
      }
    },
  };
}

function toDayjsLocale(locale: RenderLocale): string {
  return locale === 'zh-CN' ? 'zh-cn' : 'en';
}
