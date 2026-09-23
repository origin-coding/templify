import type { TemplatePreparationError } from './template-diagnostics';
import type { FieldHint, ScalarFieldDefinition } from './field-definition';

const UNSUPPORTED_TAG_PREFIXES = new Set(['#', '/', '@', '%', '~', ':', '$']);
const SIMPLE_HINTS = new Set(['string', 'number', 'boolean', 'date', 'datetime']);

export class TemplateTagFailure extends Error {
  readonly issue: TemplatePreparationError;

  constructor(issue: TemplatePreparationError) {
    super(issue.code);
    this.name = new.target.name;
    this.issue = issue;
  }
}

export function parseFieldTag(tag: string): ScalarFieldDefinition {
  const rawTag = tag;
  const normalizedTag = tag.trim();

  if (UNSUPPORTED_TAG_PREFIXES.has(normalizedTag[0] ?? '')) {
    throw new TemplateTagFailure({
      code: 'UnsupportedTemplateTag',
      reason: 'UnsupportedModule',
      rawTag,
    });
  }

  const separatorIndex = normalizedTag.indexOf(':');
  const name = (
    separatorIndex === -1 ? normalizedTag : normalizedTag.slice(0, separatorIndex)
  ).trim();
  validateFieldName(name, rawTag);

  if (separatorIndex === -1) return { kind: 'scalar', name, hint: { type: 'string' } };
  return {
    kind: 'scalar',
    name,
    hint: parseHint(normalizedTag.slice(separatorIndex + 1).trim(), rawTag),
  };
}

export function parseCollectionTag(tag: string, rawTag: string = tag): string {
  const normalizedTag = tag.trim();
  if (UNSUPPORTED_TAG_PREFIXES.has(normalizedTag[0] ?? '')) {
    throw new TemplateTagFailure({
      code: 'UnsupportedTemplateTag',
      reason: 'UnsupportedModule',
      rawTag,
    });
  }
  if (normalizedTag.includes(':')) {
    throw new TemplateTagFailure({
      code: 'InvalidTemplateTag',
      reason: 'InvalidCollectionHint',
      rawTag,
    });
  }
  validateFieldName(normalizedTag, rawTag);
  return normalizedTag;
}

function validateFieldName(name: string, rawTag: string): void {
  if (name.length === 0) {
    throw new TemplateTagFailure({
      code: 'InvalidTemplateTag',
      reason: 'EmptyFieldName',
      rawTag,
    });
  }
  if ([...name].some(isInvalidFieldNameCharacter)) {
    throw new TemplateTagFailure({
      code: 'InvalidTemplateTag',
      reason: 'InvalidFieldName',
      rawTag,
    });
  }
}

function isInvalidFieldNameCharacter(character: string): boolean {
  if (character === '{' || character === '}' || character === ':') return true;
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f));
}

function parseHint(hintSource: string, rawTag: string): FieldHint {
  if (SIMPLE_HINTS.has(hintSource)) {
    return { type: hintSource as 'string' | 'number' | 'boolean' | 'date' | 'datetime' };
  }
  if (hintSource.startsWith('option')) return parseOptionHint(hintSource, rawTag);
  throw new TemplateTagFailure({
    code: 'InvalidTemplateTag',
    reason: 'UnknownFieldHint',
    rawTag,
  });
}

function parseOptionHint(hintSource: string, rawTag: string): FieldHint {
  let values: unknown;
  try {
    values = JSON.parse(hintSource.slice('option'.length).trim()) as unknown;
  } catch {
    throw invalidOption(rawTag);
  }
  if (
    !Array.isArray(values) ||
    !values.every((value): value is string => typeof value === 'string')
  ) {
    throw invalidOption(rawTag);
  }
  return { type: 'option', values };
}

function invalidOption(rawTag: string): TemplateTagFailure {
  return new TemplateTagFailure({
    code: 'InvalidTemplateTag',
    reason: 'InvalidOptionHint',
    rawTag,
  });
}
