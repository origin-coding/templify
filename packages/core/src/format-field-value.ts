import { InvalidInputValueError, type DocumentRenderErrorReason } from './errors.js';
import type { ScalarFieldDefinition } from './field-definition.js';
import type { PrimitiveValue } from './record-data.js';

export function formatFieldValue(
  field: ScalarFieldDefinition,
  value: PrimitiveValue,
  dataPath: readonly (string | number)[] = [field.name],
  reason: DocumentRenderErrorReason = 'InvalidScalarValue',
): string {
  if (value === null) {
    return '';
  }

  switch (field.hint.type) {
    case 'string':
    case 'option':
      if (typeof value !== 'string') {
        throw invalidValue(field, 'a string', dataPath, reason);
      }
      return value;

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalidValue(field, 'a finite number', dataPath, reason);
      }
      return String(value);

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw invalidValue(field, 'a boolean', dataPath, reason);
      }
      return String(value);

    case 'date':
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw invalidValue(field, 'a valid Date', dataPath, reason);
      }
      return formatDate(value);
  }
}

function formatDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function invalidValue(
  field: ScalarFieldDefinition,
  expected: string,
  dataPath: readonly (string | number)[],
  reason: DocumentRenderErrorReason,
): InvalidInputValueError {
  return new InvalidInputValueError(
    field.name,
    `Field "${formatDataPath(dataPath)}" must contain ${expected} for the "${field.hint.type}" hint.`,
    { dataPath, reason },
  );
}

function formatDataPath(dataPath: readonly (string | number)[]): string {
  return dataPath
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${part}`,
    )
    .join('');
}
