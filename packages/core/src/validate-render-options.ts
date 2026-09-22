import { InvalidRenderOptionsError, type InvalidRenderOptionsReason } from './errors.js';
import type { FieldDefinition, ScalarFieldDefinition } from './field-definition.js';
import type {
  BooleanFieldFormat,
  DateFieldFormat,
  DateTimeFieldFormat,
  FieldFormat,
  NumberFieldFormat,
  RenderLocale,
  RenderOptions,
} from './render-options.js';

const DEFAULT_DATE_PATTERN = 'YYYY-MM-DD';
const DEFAULT_DATETIME_PATTERN = 'YYYY-MM-DD HH:mm:ss';
const SUPPORTED_LOCALES = new Set<RenderLocale>(['en', 'zh-CN']);
const DATE_TOKENS = ['YYYY', 'MMMM', 'dddd', 'MMM', 'ddd', 'YY', 'MM', 'DD', 'dd', 'M', 'D', 'd'];
const DATETIME_TOKENS = [
  ...DATE_TOKENS,
  'SSS',
  'HH',
  'hh',
  'mm',
  'ss',
  'ZZ',
  'H',
  'h',
  'm',
  's',
  'A',
  'a',
  'Z',
];

type ValidatedFieldFormat =
  | {
      readonly type: 'date';
      readonly pattern: string;
      readonly locale: RenderLocale;
    }
  | {
      readonly type: 'datetime';
      readonly pattern: string;
      readonly locale: RenderLocale;
      readonly timeZone: string | undefined;
    }
  | { readonly type: 'number'; readonly formatter: Intl.NumberFormat }
  | {
      readonly type: 'boolean';
      readonly trueText: string;
      readonly falseText: string;
    };

type ValidatedFormatMap = ReadonlyMap<string, ValidatedFieldFormat>;

export function validateRenderOptions(
  fields: readonly FieldDefinition[],
  options: RenderOptions,
): ValidatedFormatMap {
  if (!isPlainObject(options)) {
    throw invalidOptions('Render options must be an object.', 'InvalidFormatRule');
  }

  const locale = validateLocale(options.locale, undefined) ?? 'en';
  const timeZone = validateTimeZone(options.timeZone, undefined);
  return validateRules(fields, options.formats ?? [], locale, timeZone);
}

function validateRules(
  fields: readonly FieldDefinition[],
  rules: unknown,
  locale: RenderLocale,
  timeZone: string | undefined,
): ValidatedFormatMap {
  if (!Array.isArray(rules)) {
    throw invalidOptions('Render format rules must be an array.', 'InvalidFormatRule');
  }

  const formats = new Map<string, ValidatedFieldFormat>();
  for (const candidate of rules as readonly unknown[]) {
    if (!isPlainObject(candidate) || !('path' in candidate) || !('format' in candidate)) {
      throw invalidOptions(
        'Each render format rule must contain a field path and format.',
        'InvalidFormatRule',
      );
    }

    const fieldPath = validateFieldPath(candidate.path);
    const key = JSON.stringify(fieldPath);
    if (formats.has(key)) {
      throw invalidOptions(
        'A field can only have one format rule.',
        'DuplicateFieldPath',
        fieldPath,
      );
    }

    const field = findField(fields, fieldPath);
    if (field === undefined) {
      throw invalidOptions(
        'The format rule refers to an unknown template field.',
        'UnknownFieldPath',
        fieldPath,
      );
    }

    formats.set(key, validateFormat(field, candidate.format, fieldPath, locale, timeZone));
  }

  return formats;
}

function validateFieldPath(path: unknown): readonly string[] {
  if (
    !Array.isArray(path) ||
    (path.length !== 1 && path.length !== 2) ||
    path.some((part) => typeof part !== 'string' || part.length === 0)
  ) {
    throw invalidOptions(
      'A format field path must contain one scalar name or a collection and field name.',
      'InvalidFieldPath',
      Array.isArray(path)
        ? path.filter((part): part is string => typeof part === 'string')
        : undefined,
    );
  }

  return path;
}

function findField(
  fields: readonly FieldDefinition[],
  path: readonly string[],
): ScalarFieldDefinition | undefined {
  const root = fields.find((field) => field.name === path[0]);
  if (path.length === 1) return root?.kind === 'scalar' ? root : undefined;
  if (root?.kind !== 'collection') return undefined;
  return root.fields.find((field) => field.name === path[1]);
}

function validateFormat(
  field: ScalarFieldDefinition,
  candidate: unknown,
  fieldPath: readonly string[],
  locale: RenderLocale,
  timeZone: string | undefined,
): ValidatedFieldFormat {
  if (!isPlainObject(candidate) || typeof candidate.type !== 'string') {
    throw invalidOptions(
      'A render format must be an object with a supported type.',
      'InvalidFormatRule',
      fieldPath,
    );
  }

  if (!isFormatType(candidate.type)) {
    throw invalidOptions(
      `Unknown render format type: ${candidate.type}.`,
      'InvalidFormatRule',
      fieldPath,
    );
  }

  if (field.hint.type !== candidate.type) {
    throw invalidOptions(
      `The "${candidate.type}" format cannot be applied to a "${field.hint.type}" field.`,
      'IncompatibleFormatType',
      fieldPath,
    );
  }

  switch (candidate.type) {
    case 'date':
      return validateDateFormat(candidate as unknown as DateFieldFormat, fieldPath, locale);
    case 'datetime':
      return validateDateTimeFormat(
        candidate as unknown as DateTimeFieldFormat,
        fieldPath,
        locale,
        timeZone,
      );
    case 'number':
      return {
        type: 'number',
        formatter: createNumberFormatter(
          candidate as unknown as NumberFieldFormat,
          fieldPath,
          locale,
        ),
      };
    case 'boolean':
      return validateBooleanFormat(candidate as unknown as BooleanFieldFormat, fieldPath);
  }
}

function validateDateFormat(
  format: DateFieldFormat,
  fieldPath: readonly string[],
  defaultLocale: RenderLocale,
): ValidatedFieldFormat {
  const locale = validateLocale(format.locale, fieldPath) ?? defaultLocale;
  const pattern = validatePattern(format.pattern, fieldPath, 'date') ?? DEFAULT_DATE_PATTERN;
  return { type: 'date', locale, pattern };
}

function validateDateTimeFormat(
  format: DateTimeFieldFormat,
  fieldPath: readonly string[],
  defaultLocale: RenderLocale,
  defaultTimeZone: string | undefined,
): ValidatedFieldFormat {
  const locale = validateLocale(format.locale, fieldPath) ?? defaultLocale;
  const pattern =
    validatePattern(format.pattern, fieldPath, 'datetime') ?? DEFAULT_DATETIME_PATTERN;
  const timeZone = validateTimeZone(format.timeZone, fieldPath) ?? defaultTimeZone;
  return { type: 'datetime', locale, pattern, timeZone };
}

function validateBooleanFormat(
  format: BooleanFieldFormat,
  fieldPath: readonly string[],
): ValidatedFieldFormat {
  if (typeof format.trueText !== 'string' || typeof format.falseText !== 'string') {
    throw invalidOptions(
      'Boolean format labels must be strings.',
      'InvalidBooleanFormat',
      fieldPath,
    );
  }
  return { type: 'boolean', trueText: format.trueText, falseText: format.falseText };
}

function validateLocale(
  locale: unknown,
  fieldPath: readonly string[] | undefined,
): RenderLocale | undefined {
  if (locale !== undefined && !SUPPORTED_LOCALES.has(locale as RenderLocale)) {
    throw invalidOptions('The render locale must be "en" or "zh-CN".', 'InvalidLocale', fieldPath);
  }
  return locale as RenderLocale | undefined;
}

function validateTimeZone(
  timeZone: unknown,
  fieldPath: readonly string[] | undefined,
): string | undefined {
  if (timeZone === undefined) return undefined;
  if (typeof timeZone !== 'string' || timeZone.length === 0) {
    throw invalidOptions(
      'The configured time zone must be a non-empty IANA time zone name.',
      'InvalidTimeZone',
      fieldPath,
    );
  }

  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch (cause) {
    throw invalidOptions(
      'The configured time zone is invalid.',
      'InvalidTimeZone',
      fieldPath,
      cause,
    );
  }
  return timeZone;
}

function validatePattern(
  pattern: unknown,
  fieldPath: readonly string[],
  type: 'date' | 'datetime',
): string | undefined {
  if (pattern === undefined) return undefined;
  if (
    typeof pattern !== 'string' ||
    pattern.length === 0 ||
    [...pattern].some(isControlCharacter)
  ) {
    throw invalidOptions(
      'A date format pattern must be non-empty and cannot contain control characters.',
      'InvalidDatePattern',
      fieldPath,
    );
  }

  validatePatternTokens(pattern, fieldPath, type);
  return pattern;
}

function validatePatternTokens(
  pattern: string,
  fieldPath: readonly string[],
  type: 'date' | 'datetime',
): void {
  const tokens = type === 'date' ? DATE_TOKENS : DATETIME_TOKENS;
  let insideLiteral = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '[') {
      if (insideLiteral) {
        throw invalidOptions(
          'Date format literals cannot be nested.',
          'InvalidDatePattern',
          fieldPath,
        );
      }
      insideLiteral = true;
    } else if (character === ']') {
      if (!insideLiteral) {
        throw invalidOptions(
          'A date format pattern contains an unmatched closing bracket.',
          'InvalidDatePattern',
          fieldPath,
        );
      }
      insideLiteral = false;
    } else if (!insideLiteral && /[A-Za-z]/u.test(character)) {
      const token = tokens.find((candidate) => pattern.startsWith(candidate, index));
      if (token === undefined) {
        throw invalidOptions(
          `The ${type} format pattern contains an unsupported token near "${pattern.slice(index)}".`,
          'InvalidDatePattern',
          fieldPath,
        );
      }
      index += token.length - 1;
    }
  }

  if (insideLiteral) {
    throw invalidOptions(
      'A date format pattern contains an unmatched opening bracket.',
      'InvalidDatePattern',
      fieldPath,
    );
  }
}

function createNumberFormatter(
  format: NumberFieldFormat,
  fieldPath: readonly string[],
  defaultLocale: RenderLocale,
): Intl.NumberFormat {
  const locale = validateLocale(format.locale, fieldPath) ?? defaultLocale;
  validateNumberOptions(format, fieldPath);
  const options: Intl.NumberFormatOptions = {
    ...(format.useGrouping === undefined ? {} : { useGrouping: format.useGrouping }),
    ...(format.minimumFractionDigits === undefined
      ? {}
      : { minimumFractionDigits: format.minimumFractionDigits }),
    ...(format.maximumFractionDigits === undefined
      ? {}
      : { maximumFractionDigits: format.maximumFractionDigits }),
  };

  if (format.currency !== undefined) {
    options.style = 'currency';
    options.currency = format.currency;
    if (format.currencyDisplay !== undefined) options.currencyDisplay = format.currencyDisplay;
  } else if (format.currencyDisplay !== undefined) {
    throw invalidOptions(
      'currencyDisplay requires a currency code.',
      'InvalidNumberFormat',
      fieldPath,
    );
  }

  try {
    return new Intl.NumberFormat(locale, options);
  } catch (cause) {
    throw invalidOptions(
      'The configured number format is invalid.',
      'InvalidNumberFormat',
      fieldPath,
      cause,
    );
  }
}

function validateNumberOptions(format: NumberFieldFormat, fieldPath: readonly string[]): void {
  if (
    (format.useGrouping !== undefined && typeof format.useGrouping !== 'boolean') ||
    (format.currency !== undefined && typeof format.currency !== 'string') ||
    (format.currencyDisplay !== undefined &&
      !['symbol', 'narrowSymbol', 'code', 'name'].includes(format.currencyDisplay)) ||
    !isOptionalNonNegativeInteger(format.minimumFractionDigits) ||
    !isOptionalNonNegativeInteger(format.maximumFractionDigits)
  ) {
    throw invalidOptions(
      'The configured number format contains an invalid option.',
      'InvalidNumberFormat',
      fieldPath,
    );
  }
}

function isFormatType(value: string): value is FieldFormat['type'] {
  return value === 'date' || value === 'datetime' || value === 'number' || value === 'boolean';
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0);
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f));
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidOptions(
  message: string,
  reason: InvalidRenderOptionsReason,
  fieldPath?: readonly string[],
  cause?: unknown,
): InvalidRenderOptionsError {
  return new InvalidRenderOptionsError(message, { reason, fieldPath, cause });
}
