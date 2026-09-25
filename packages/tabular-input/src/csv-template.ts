import type { StageResult, TemplateDefinition } from '@templify/core';

export type CsvTemplateError =
  | { readonly code: 'UnsupportedTabularTemplate'; readonly fieldName: string }
  | { readonly code: 'NoTemplateFields' };

export function validateScalarTabularTemplate(
  definition: TemplateDefinition,
): StageResult<void, CsvTemplateError> {
  const collection = definition.fields.find((field) => field.kind === 'collection');
  if (collection !== undefined)
    return {
      ok: false,
      errors: [{ code: 'UnsupportedTabularTemplate', fieldName: collection.name }],
      warnings: [],
    };
  if (definition.fields.length === 0)
    return { ok: false, errors: [{ code: 'NoTemplateFields' }], warnings: [] };
  return { ok: true, value: undefined, warnings: [] };
}

export function createCsvTemplate(
  definition: TemplateDefinition,
): StageResult<Uint8Array, CsvTemplateError> {
  const validated = validateScalarTabularTemplate(definition);
  if (!validated.ok) return validated;
  const header = definition.fields.map((field) => escapeCsvCell(field.name)).join(',') + '\r\n';
  const data = new TextEncoder().encode(header);
  const bytes = new Uint8Array(data.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(data, 3);
  return { ok: true, value: bytes, warnings: [] };
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
}
