import { describe, expect, it } from 'vitest';

import { InvalidInputValueError } from '../src/index.js';
import { formatFieldValue } from '../src/format-field-value.js';

describe('formatFieldValue', () => {
  it.each([
    [
      { kind: 'scalar' as const, name: 'name', hint: { type: 'string' as const } },
      'Alice',
      'Alice',
    ],
    [
      { kind: 'scalar' as const, name: 'amount', hint: { type: 'number' as const } },
      1234.5,
      '1234.5',
    ],
    [
      { kind: 'scalar' as const, name: 'enabled', hint: { type: 'boolean' as const } },
      false,
      'false',
    ],
    [
      {
        kind: 'scalar' as const,
        name: 'department',
        hint: { type: 'option' as const, values: ['Engineering'] },
      },
      'Custom department',
      'Custom department',
    ],
  ])('formats $field.name without display decoration', (field, value, expected) => {
    expect(formatFieldValue(field, value)).toBe(expected);
  });

  it('formats dates as yyyy-MM-dd from UTC calendar fields', () => {
    const field = {
      kind: 'scalar' as const,
      name: 'birthday',
      hint: { type: 'date' as const },
    };
    const value = new Date('2026-09-20T23:30:00.000Z');

    expect(formatFieldValue(field, value)).toBe('2026-09-20');
  });

  it('renders null as an empty string for every hint', () => {
    const field = {
      kind: 'scalar' as const,
      name: 'amount',
      hint: { type: 'number' as const },
    };

    expect(formatFieldValue(field, null)).toBe('');
  });

  it.each([
    [{ kind: 'scalar' as const, name: 'name', hint: { type: 'string' as const } }, 1],
    [{ kind: 'scalar' as const, name: 'amount', hint: { type: 'number' as const } }, Number.NaN],
    [
      { kind: 'scalar' as const, name: 'amount', hint: { type: 'number' as const } },
      Number.POSITIVE_INFINITY,
    ],
    [{ kind: 'scalar' as const, name: 'enabled', hint: { type: 'boolean' as const } }, 'true'],
    [
      { kind: 'scalar' as const, name: 'birthday', hint: { type: 'date' as const } },
      new Date(Number.NaN),
    ],
  ])('rejects an invalid value for $field.name', (field, value) => {
    expect(() => formatFieldValue(field, value)).toThrow(InvalidInputValueError);
  });
});
