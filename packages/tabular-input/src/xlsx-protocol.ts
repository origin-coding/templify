import type { CollectionFieldDefinition, TemplateDefinition } from '@templify/core';

export const RECORD_ID_COLUMN = '__templify_id';
export const PARENT_ID_COLUMN = '__templify_parent_id';

export type XlsxTemplateError =
  | { readonly code: 'NoTemplateFields' }
  | { readonly code: 'XlsxTemplateFailed'; readonly reason: string }
  | { readonly code: 'InvalidXlsxSheetName'; readonly fieldName: string }
  | { readonly code: 'DuplicateXlsxSheetName'; readonly fieldNames: readonly [string, string] }
  | { readonly code: 'ReservedXlsxFieldName'; readonly fieldName: string; readonly scope: string };

export function xlsxCollections(
  definition: TemplateDefinition,
): readonly CollectionFieldDefinition[] {
  return definition.fields.filter(
    (field): field is CollectionFieldDefinition => field.kind === 'collection',
  );
}

export function validateXlsxDefinition(
  definition: TemplateDefinition,
): XlsxTemplateError | undefined {
  if (definition.fields.length === 0) return { code: 'NoTemplateFields' };
  const collections = xlsxCollections(definition);
  if (collections.length === 0) return undefined;

  const rootConflict = definition.fields.find(
    (field) => field.kind === 'scalar' && field.name === RECORD_ID_COLUMN,
  );
  if (rootConflict) {
    return { code: 'ReservedXlsxFieldName', fieldName: RECORD_ID_COLUMN, scope: 'root' };
  }
  const byLowerName = new Map<string, string>();
  for (const collection of collections) {
    if (!validSheetName(collection.name)) {
      return { code: 'InvalidXlsxSheetName', fieldName: collection.name };
    }
    const normalized = collection.name.toLocaleLowerCase('en-US');
    const existing = byLowerName.get(normalized);
    if (existing !== undefined) {
      return { code: 'DuplicateXlsxSheetName', fieldNames: [existing, collection.name] };
    }
    byLowerName.set(normalized, collection.name);
    if (collection.fields.some((field) => field.name === PARENT_ID_COLUMN)) {
      return {
        code: 'ReservedXlsxFieldName',
        fieldName: PARENT_ID_COLUMN,
        scope: collection.name,
      };
    }
  }
  return undefined;
}

function validSheetName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 31 &&
    ![':', '\\', '/', '?', '*', '[', ']'].some((character) => name.includes(character)) &&
    !name.startsWith("'") &&
    !name.endsWith("'") &&
    name.toLocaleLowerCase('en-US') !== 'history'
  );
}

export function rootSheetName(collections: readonly CollectionFieldDefinition[]): string {
  const names = new Set(
    collections.map((collection) => collection.name.toLocaleLowerCase('en-US')),
  );
  let name = 'Records';
  let index = 2;
  while (names.has(name.toLocaleLowerCase('en-US'))) {
    name = 'Records ' + index;
    index += 1;
  }
  return name;
}
