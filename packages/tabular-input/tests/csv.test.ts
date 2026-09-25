import { describe, expect, it } from 'vitest';
import { normalizeRecords, type TemplateDefinition } from '@templify/core';
import { createCsvTemplate, parseCsvInput, validateScalarTabularTemplate } from '../src/index';

const definition: TemplateDefinition = {
  version: 1,
  kind: 'docx',
  fields: [
    { kind: 'scalar', name: 'name', hint: { type: 'string' } },
    { kind: 'scalar', name: 'age', hint: { type: 'number' } },
  ],
};

describe('CSV input adapter', () => {
  it.each([false, true])('parses UTF-8 with BOM = %s and preserves physical source rows', (bom) => {
    const content = 'age,name\r\n1,Alice\r\n\r\n2,"Bob\nSmith"\r\n';
    const encoded = new TextEncoder().encode(content);
    const bytes = bom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...encoded]) : encoded;
    const parsed = parseCsvInput(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      columns: ['age', 'name'],
      rows: [
        ['1', 'Alice'],
        ['2', 'Bob\nSmith'],
      ],
      origins: [{ sourceRowNumber: 2 }, { sourceRowNumber: 4 }],
    });
    const normalized = normalizeRecords(definition, parsed.value);
    expect(normalized).toMatchObject({
      ok: true,
      value: {
        records: [
          { name: 'Alice', age: 1 },
          { name: 'Bob\nSmith', age: 2 },
        ],
      },
    });
  });

  it('keeps duplicate headers for core to reject before values are mapped', () => {
    const parsed = parseCsvInput(new TextEncoder().encode('name,name,age\nA,B,1\n'));
    if (!parsed.ok) throw new Error('CSV should parse');
    expect(normalizeRecords(definition, parsed.value)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        { code: 'DuplicateInputField', fieldName: 'name', columnNumbers: [1, 2] },
      ]),
    });
  });

  it('reports empty headers and malformed row widths', () => {
    expect(parseCsvInput(new TextEncoder().encode('name,,age\nA,B,1\n'))).toMatchObject({
      ok: false,
      errors: [{ code: 'EmptyCsvHeader', columnNumber: 2 }],
    });
    expect(parseCsvInput(new TextEncoder().encode('name,age\nA\n'))).toMatchObject({
      ok: false,
      errors: [{ code: 'InvalidCsv' }],
    });
  });

  it('supports explicit GBK and rejects it under default UTF-8', () => {
    const bytes = Uint8Array.from([...new TextEncoder().encode('name\n'), 0xd6, 0xd0, 0xce, 0xc4]);
    expect(parseCsvInput(bytes)).toMatchObject({
      ok: false,
      errors: [{ code: 'InvalidCsvEncoding', encoding: 'utf8' }],
    });
    expect(parseCsvInput(bytes, { encoding: 'gbk' })).toMatchObject({
      ok: true,
      value: { columns: ['name'], rows: [['中文']] },
    });
  });

  it('exports only scalar fields as a header-only UTF-8 BOM CSV', () => {
    const template = createCsvTemplate(definition);
    if (!template.ok) throw new Error('CSV template should be generated');
    expect([...template.value.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(template.value)).toBe('name,age\r\n');
    const collection: TemplateDefinition = {
      ...definition,
      fields: [{ kind: 'collection', name: 'items', fields: [] }],
    };
    expect(validateScalarTabularTemplate(collection)).toMatchObject({
      ok: false,
      errors: [{ code: 'UnsupportedTabularTemplate', fieldName: 'items' }],
    });
    expect(createCsvTemplate(collection)).toMatchObject({
      ok: false,
      errors: [{ code: 'UnsupportedTabularTemplate', fieldName: 'items' }],
    });
  });
});
