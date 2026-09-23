import type { StageResult } from '@/stage-result';
import type { FieldDefinition, ScalarFieldDefinition } from '@/template/field-definition';
import type { TemplateDefinition } from '@/template/template-definition';
import type {
  BooleanFieldFormat,
  DateFieldFormat,
  DateTimeFieldFormat,
  FieldFormat,
  FieldPath,
  NumberFieldFormat,
  RenderLocale,
  RenderOptions,
} from './render-options';
import type { RenderOptionsError } from './rendering-diagnostics';
import type {
  ValidatedFieldFormat,
  ValidatedFieldFormatRule,
  ValidatedRenderOptions,
} from './validated-render-options';

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

export type ValidateRenderOptionsResult = StageResult<ValidatedRenderOptions, RenderOptionsError>;

class RenderOptionsFailure extends Error {
  readonly issue: RenderOptionsError;
  constructor(issue: RenderOptionsError) {
    super(issue.code);
    this.name = new.target.name;
    this.issue = issue;
  }
}

export function validateRenderOptions(
  definition: TemplateDefinition,
  candidate: RenderOptions = {},
): ValidateRenderOptionsResult {
  try {
    if (!isPlainObject(candidate)) fail('InvalidFormatRule');
    const locale = validateLocale(candidate.locale) ?? 'en';
    const timeZone =
      validateTimeZone(candidate.timeZone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone === undefined || timeZone.length === 0) fail('InvalidTimeZone');
    const formats = validateRules(definition.fields, candidate.formats ?? [], locale, timeZone);
    return { ok: true, value: { locale, timeZone, formats }, warnings: [] };
  } catch (cause) {
    const issue =
      cause instanceof RenderOptionsFailure
        ? cause.issue
        : ({ code: 'InvalidRenderOptions', reason: 'InvalidFormatRule' } as const);
    return { ok: false, errors: [issue], warnings: [] };
  }
}

function validateRules(
  fields: readonly FieldDefinition[],
  rules: unknown,
  locale: RenderLocale,
  timeZone: string,
): readonly ValidatedFieldFormatRule[] {
  if (!Array.isArray(rules)) fail('InvalidFormatRule');
  const formats: ValidatedFieldFormatRule[] = [];
  const keys = new Set<string>();
  for (const candidate of rules as readonly unknown[]) {
    if (!isPlainObject(candidate) || !('path' in candidate) || !('format' in candidate)) {
      fail('InvalidFormatRule');
    }
    const path = validateFieldPath(candidate.path);
    const key = JSON.stringify(path);
    if (keys.has(key)) fail('DuplicateFieldPath', path);
    keys.add(key);
    const field = findField(fields, path);
    if (field === undefined) fail('UnknownFieldPath', path);
    formats.push({ path, format: validateFormat(field, candidate.format, path, locale, timeZone) });
  }
  return formats;
}

function validateFieldPath(candidate: unknown): FieldPath {
  if (
    !Array.isArray(candidate) ||
    (candidate.length !== 1 && candidate.length !== 2) ||
    candidate.some((part) => typeof part !== 'string' || part.length === 0)
  ) {
    fail(
      'InvalidFieldPath',
      Array.isArray(candidate)
        ? candidate.filter((part): part is string => typeof part === 'string')
        : undefined,
    );
  }
  return candidate as unknown as FieldPath;
}

function findField(
  fields: readonly FieldDefinition[],
  path: FieldPath,
): ScalarFieldDefinition | undefined {
  const root = fields.find((field) => field.name === path[0]);
  if (path.length === 1) return root?.kind === 'scalar' ? root : undefined;
  return root?.kind === 'collection'
    ? root.fields.find((field) => field.name === path[1])
    : undefined;
}

function validateFormat(
  field: ScalarFieldDefinition,
  candidate: unknown,
  path: FieldPath,
  locale: RenderLocale,
  timeZone: string,
): ValidatedFieldFormat {
  if (!isPlainObject(candidate) || typeof candidate.type !== 'string') {
    fail('InvalidFormatRule', path);
  }
  if (!isFormatType(candidate.type)) fail('InvalidFormatRule', path);
  if (field.hint.type !== candidate.type) fail('IncompatibleFormatType', path);

  switch (candidate.type) {
    case 'date':
      return validateDateFormat(candidate as unknown as DateFieldFormat, path, locale);
    case 'datetime':
      return validateDateTimeFormat(
        candidate as unknown as DateTimeFieldFormat,
        path,
        locale,
        timeZone,
      );
    case 'number':
      return validateNumberFormat(candidate as unknown as NumberFieldFormat, path, locale);
    case 'boolean':
      return validateBooleanFormat(candidate as unknown as BooleanFieldFormat, path);
  }
}

function validateDateFormat(
  format: DateFieldFormat,
  path: FieldPath,
  defaultLocale: RenderLocale,
): ValidatedFieldFormat {
  return {
    type: 'date',
    locale: validateLocale(format.locale, path) ?? defaultLocale,
    pattern: validatePattern(format.pattern, path, 'date') ?? DEFAULT_DATE_PATTERN,
  };
}

function validateDateTimeFormat(
  format: DateTimeFieldFormat,
  path: FieldPath,
  defaultLocale: RenderLocale,
  defaultTimeZone: string,
): ValidatedFieldFormat {
  return {
    type: 'datetime',
    locale: validateLocale(format.locale, path) ?? defaultLocale,
    pattern: validatePattern(format.pattern, path, 'datetime') ?? DEFAULT_DATETIME_PATTERN,
    timeZone: validateTimeZone(format.timeZone, path) ?? defaultTimeZone,
  };
}

function validateNumberFormat(
  format: NumberFieldFormat,
  path: FieldPath,
  defaultLocale: RenderLocale,
): ValidatedFieldFormat {
  if (
    (format.useGrouping !== undefined && typeof format.useGrouping !== 'boolean') ||
    (format.currency !== undefined && typeof format.currency !== 'string') ||
    (format.currencyDisplay !== undefined &&
      !['symbol', 'narrowSymbol', 'code', 'name'].includes(format.currencyDisplay)) ||
    !isOptionalNonNegativeInteger(format.minimumFractionDigits) ||
    !isOptionalNonNegativeInteger(format.maximumFractionDigits) ||
    (format.currency === undefined && format.currencyDisplay !== undefined)
  ) {
    fail('InvalidNumberFormat', path);
  }
  const locale = validateLocale(format.locale, path) ?? defaultLocale;
  const options: Intl.NumberFormatOptions = {
    ...(format.useGrouping === undefined ? {} : { useGrouping: format.useGrouping }),
    ...(format.minimumFractionDigits === undefined
      ? {}
      : { minimumFractionDigits: format.minimumFractionDigits }),
    ...(format.maximumFractionDigits === undefined
      ? {}
      : { maximumFractionDigits: format.maximumFractionDigits }),
    ...(format.currency === undefined
      ? {}
      : {
          style: 'currency' as const,
          currency: format.currency,
          ...(format.currencyDisplay === undefined
            ? {}
            : { currencyDisplay: format.currencyDisplay }),
        }),
  };
  try {
    void new Intl.NumberFormat(locale, options);
  } catch {
    fail('InvalidNumberFormat', path);
  }
  return { type: 'number', locale, options };
}

function validateBooleanFormat(format: BooleanFieldFormat, path: FieldPath): ValidatedFieldFormat {
  if (typeof format.trueText !== 'string' || typeof format.falseText !== 'string') {
    fail('InvalidBooleanFormat', path);
  }
  return { type: 'boolean', trueText: format.trueText, falseText: format.falseText };
}

function validateLocale(value: unknown, path?: readonly string[]): RenderLocale | undefined {
  if (value !== undefined && !SUPPORTED_LOCALES.has(value as RenderLocale)) {
    fail('InvalidLocale', path);
  }
  return value as RenderLocale | undefined;
}

function validateTimeZone(value: unknown, path?: readonly string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) fail('InvalidTimeZone', path);
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
  } catch {
    fail('InvalidTimeZone', path);
  }
  return value;
}

function validatePattern(
  value: unknown,
  path: FieldPath,
  type: 'date' | 'datetime',
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || [...value].some(isControlCharacter)) {
    fail('InvalidDatePattern', path);
  }
  validatePatternTokens(value, path, type);
  return value;
}

function validatePatternTokens(pattern: string, path: FieldPath, type: 'date' | 'datetime'): void {
  const tokens = type === 'date' ? DATE_TOKENS : DATETIME_TOKENS;
  let literal = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '[') {
      if (literal) fail('InvalidDatePattern', path);
      literal = true;
    } else if (character === ']') {
      if (!literal) fail('InvalidDatePattern', path);
      literal = false;
    } else if (!literal && /[A-Za-z]/u.test(character)) {
      const token = tokens.find((candidate) => pattern.startsWith(candidate, index));
      if (token === undefined) fail('InvalidDatePattern', path);
      index += token.length - 1;
    }
  }
  if (literal) fail('InvalidDatePattern', path);
}

function fail(reason: RenderOptionsError['reason'], fieldPath?: readonly string[]): never {
  throw new RenderOptionsFailure({
    code: 'InvalidRenderOptions',
    reason,
    ...(fieldPath === undefined ? {} : { fieldPath }),
  });
}

function isFormatType(value: string): value is FieldFormat['type'] {
  return value === 'date' || value === 'datetime' || value === 'number' || value === 'boolean';
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0);
}

function isControlCharacter(character: string): boolean {
  const point = character.codePointAt(0);
  return point !== undefined && (point <= 0x1f || (point >= 0x7f && point <= 0x9f));
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
