import { InvalidInputValueError } from './errors.js';
import type { FieldDefinition } from './field-definition.js';
import type { PrimitiveValue } from './record-data.js';

export function formatFieldValue(field: FieldDefinition, value: PrimitiveValue): string {
  if (value === null) {
    return '';
  }

  switch (field.hint.type) {
    case 'string':
    case 'option':
      if (typeof value !== 'string') {
        throw invalidValue(field, 'a string');
      }
      return value;

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalidValue(field, 'a finite number');
      }
      return String(value);

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw invalidValue(field, 'a boolean');
      }
      return String(value);

    case 'date':
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw invalidValue(field, 'a valid Date');
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

function invalidValue(field: FieldDefinition, expected: string): InvalidInputValueError {
  return new InvalidInputValueError(
    field.name,
    `Field "${field.name}" must contain ${expected} for the "${field.hint.type}" hint.`,
  );
}
