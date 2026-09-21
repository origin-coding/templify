import { InvalidTemplateTagError, UnsupportedTemplateTagError } from './errors.js';
import type { FieldHint, ScalarFieldDefinition } from './field-definition.js';

const UNSUPPORTED_TAG_PREFIXES = new Set(['#', '/', '@', '%', '~', ':', '$']);

const SIMPLE_HINTS = new Set(['string', 'number', 'boolean', 'date']);

export function parseFieldTag(tag: string): ScalarFieldDefinition {
  const rawTag = tag;
  const normalizedTag = tag.trim();

  if (UNSUPPORTED_TAG_PREFIXES.has(normalizedTag[0] ?? '')) {
    throw new UnsupportedTemplateTagError(rawTag);
  }

  const separatorIndex = normalizedTag.indexOf(':');
  const name = (
    separatorIndex === -1 ? normalizedTag : normalizedTag.slice(0, separatorIndex)
  ).trim();

  validateFieldName(name, rawTag);

  if (separatorIndex === -1) {
    return { kind: 'scalar', name, hint: { type: 'string' } };
  }

  const hintSource = normalizedTag.slice(separatorIndex + 1).trim();
  return { kind: 'scalar', name, hint: parseHint(hintSource, rawTag) };
}

export function parseCollectionTag(tag: string, rawTag = tag): string {
  const normalizedTag = tag.trim();

  if (UNSUPPORTED_TAG_PREFIXES.has(normalizedTag[0] ?? '')) {
    throw new UnsupportedTemplateTagError(rawTag);
  }

  if (normalizedTag.includes(':')) {
    throw new InvalidTemplateTagError(rawTag, 'A collection tag cannot contain a type hint.');
  }

  validateFieldName(normalizedTag, rawTag);
  return normalizedTag;
}

function validateFieldName(name: string, rawTag: string): void {
  if (name.length === 0) {
    throw new InvalidTemplateTagError(rawTag, 'A template field name cannot be empty.');
  }

  if ([...name].some(isInvalidFieldNameCharacter)) {
    throw new InvalidTemplateTagError(
      rawTag,
      'A template field name cannot contain braces, colons, or control characters.',
    );
  }
}

function isInvalidFieldNameCharacter(character: string): boolean {
  if (character === '{' || character === '}' || character === ':') {
    return true;
  }

  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f));
}

function parseHint(hintSource: string, rawTag: string): FieldHint {
  if (SIMPLE_HINTS.has(hintSource)) {
    return { type: hintSource as 'string' | 'number' | 'boolean' | 'date' };
  }

  if (hintSource.startsWith('option')) {
    return parseOptionHint(hintSource, rawTag);
  }

  throw new InvalidTemplateTagError(rawTag, `Unknown field hint: ${hintSource || '(empty)'}.`);
}

function parseOptionHint(hintSource: string, rawTag: string): FieldHint {
  const serializedValues = hintSource.slice('option'.length).trim();
  let values: unknown;

  try {
    values = JSON.parse(serializedValues) as unknown;
  } catch (cause) {
    throw new InvalidTemplateTagError(
      rawTag,
      'An option hint must contain a valid JSON array of strings.',
      { cause },
    );
  }

  if (
    !Array.isArray(values) ||
    !values.every((value): value is string => typeof value === 'string')
  ) {
    throw new InvalidTemplateTagError(
      rawTag,
      'An option hint must contain a JSON array with only string values.',
    );
  }

  return { type: 'option', values };
}
