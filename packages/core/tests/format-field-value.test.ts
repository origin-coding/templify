import { describe, expect, it } from 'vitest';

import { InvalidInputValueError } from '../src/index.js';
import { formatFieldValue } from '../src/format-field-value.js';

describe('formatFieldValue', () => {
  it.each([
    [{ name: 'name', hint: { type: 'string' as const } }, 'Alice', 'Alice'],
    [{ name: 'amount', hint: { type: 'number' as const } }, 1234.5, '1234.5'],
    [{ name: 'enabled', hint: { type: 'boolean' as const } }, false, 'false'],
    [
      { name: 'department', hint: { type: 'option' as const, values: ['Engineering'] } },
      'Custom department',
      'Custom department',
    ],
  ])('formats $field.name without display decoration', (field, value, expected) => {
    expect(formatFieldValue(field, value)).toBe(expected);
  });

  it('formats dates as yyyy-MM-dd from UTC calendar fields', () => {
    const field = { name: 'birthday', hint: { type: 'date' as const } };
    const value = new Date('2026-09-20T23:30:00.000Z');

    expect(formatFieldValue(field, value)).toBe('2026-09-20');
  });

  it('renders null as an empty string for every hint', () => {
    const field = { name: 'amount', hint: { type: 'number' as const } };

    expect(formatFieldValue(field, null)).toBe('');
  });

  it.each([
    [{ name: 'name', hint: { type: 'string' as const } }, 1],
    [{ name: 'amount', hint: { type: 'number' as const } }, Number.NaN],
    [{ name: 'amount', hint: { type: 'number' as const } }, Number.POSITIVE_INFINITY],
    [{ name: 'enabled', hint: { type: 'boolean' as const } }, 'true'],
    [{ name: 'birthday', hint: { type: 'date' as const } }, new Date(Number.NaN)],
  ])('rejects an invalid value for $field.name', (field, value) => {
    expect(() => formatFieldValue(field, value)).toThrow(InvalidInputValueError);
  });
});
