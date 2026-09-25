import { describe, expect, it } from 'vitest';
import { normalizeRecords, type TemplateDefinition } from '@/index';

const definition: TemplateDefinition = {
  version: 1,
  kind: 'docx',
  fields: [
    { kind: 'scalar', name: 'text', hint: { type: 'string' } },
    { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
    { kind: 'scalar', name: 'enabled', hint: { type: 'boolean' } },
    { kind: 'scalar', name: 'day', hint: { type: 'date' } },
    { kind: 'scalar', name: 'instant', hint: { type: 'datetime' } },
    { kind: 'scalar', name: 'choice', hint: { type: 'option', values: ['A'] } },
  ],
};

describe('record normalization', () => {
  it('performs only accepted conversions and does not constrain option values', () => {
    const result = normalizeRecords(definition, {
      kind: 'object-rows',
      rows: [
        {
          text: false,
          amount: '1.2e3',
          enabled: 'FALSE',
          day: '2024-02-29',
          instant: '2024-02-29T12:30:45+08:00',
          choice: 'outside-list',
        },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      value: { records: [{ text: 'false', amount: 1200, enabled: false, choice: 'outside-list' }] },
    });
    if (!result.ok) throw new Error('normalization failed');
    expect(result.value.records[0]!.day).toEqual(new Date('2024-02-29T00:00:00.000Z'));
    expect(result.value.records[0]!.instant).toEqual(new Date('2024-02-29T04:30:45.000Z'));
  });

  it.each([
    ['number', { ...baseRow(), amount: '1,200' }, 'InvalidNumber'],
    ['boolean', { ...baseRow(), enabled: 1 }, 'TypeMismatch'],
    ['date', { ...baseRow(), day: '2023-02-29' }, 'InvalidDate'],
    ['datetime calendar', { ...baseRow(), instant: '2024-02-30T12:00:00Z' }, 'InvalidDateTime'],
    ['datetime offset', { ...baseRow(), instant: '2024-01-01T12:00:00+24:00' }, 'InvalidDateTime'],
  ])('rejects invalid %s values', (_label, row, reason) => {
    expect(normalizeRecords(definition, { kind: 'object-rows', rows: [row] })).toMatchObject({
      ok: false,
      errors: [{ code: 'InvalidInputValue', reason }],
    });
  });

  it('suggests checking the header when no template field matches', () => {
    expect(
      normalizeRecords(definition, {
        kind: 'tabular',
        columns: ['Alice', 'Sales'],
        rows: [['Bob', 'Finance']],
      }),
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.objectContaining({ code: 'NoMatchingInputFields' })]),
    });
  });

  it('rejects duplicate and missing columns while ignoring extras and empty rows', () => {
    expect(
      normalizeRecords(definition, { kind: 'tabular', columns: ['text', 'text'], rows: [] }),
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        { code: 'DuplicateInputField', fieldName: 'text', columnNumbers: [1, 2] },
        { code: 'MissingInputField', fieldName: 'amount' },
      ]),
    });
    const columns = definition.fields.map((field) => field.name).concat('extra');
    const row = Object.values(baseRow()).concat('ignored');
    const accepted = normalizeRecords(definition, {
      kind: 'tabular',
      columns,
      rows: [row, columns.map(() => '')],
    });
    expect(accepted).toMatchObject({
      ok: true,
      warnings: [
        { code: 'EmptyInputRowsIgnored', rowCount: 1 },
        { code: 'ExtraInputFieldsIgnored', fieldNames: ['extra'] },
      ],
    });
  });
});

function baseRow(): Record<string, unknown> {
  return {
    text: 'text',
    amount: 1,
    enabled: true,
    day: '2024-01-01',
    instant: '2024-01-01T12:00:00Z',
    choice: 'A',
  };
}
