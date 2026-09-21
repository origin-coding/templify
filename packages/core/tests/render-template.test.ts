import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  InvalidInputValueError,
  InvalidTemplateError,
  MissingInputFieldError,
  RenderFailedError,
  renderTemplate,
} from '../src/index.js';
import { createDocx, createDocxWithTableRow } from './docx-fixture.js';

describe('renderTemplate', () => {
  it('renders one normalized scalar record into a structurally valid DOCX buffer', () => {
    const template = createDocx([
      ['Name: {name}'],
      ['Typed name: {na', 'me:string}'],
      ['Name again: {name}'],
      ['Amount: {amount:number}'],
      ['Enabled: {enabled:boolean}'],
      ['Birthday: {birthday:date}'],
      ['Department: {department:option["Engineering","Finance"]}'],
      ['Notes: {notes}'],
      ['Empty: {empty}'],
    ]);

    const output = renderTemplate(template, {
      name: 'Alice',
      amount: 1234.5,
      enabled: false,
      birthday: new Date('2026-09-20T23:30:00.000Z'),
      department: 'Engineering',
      notes: 'A & B <公司>',
      empty: null,
      extra: 'ignored',
    });

    expect(output).toBeInstanceOf(Buffer);
    expect(output.byteLength).toBeGreaterThan(0);

    const documentXml = readDocumentXml(output);
    expect(documentXml.match(/Alice/g)).toHaveLength(3);
    expect(documentXml).toContain('1234.5');
    expect(documentXml).toContain('false');
    expect(documentXml).toContain('2026-09-20');
    expect(documentXml).toContain('Engineering');
    expect(documentXml).toContain('A &amp; B &lt;公司&gt;');
    expect(documentXml).not.toContain('{name}');
    expect(documentXml).not.toContain('{name:string}');
    expect(documentXml).not.toContain('{birthday:date}');
  });

  it('renders and formats every item in a paragraph collection', () => {
    const template = createDocx([
      ['Report: {title}'],
      ['{#items}'],
      [
        '{description} | {amount:number} | {enabled:boolean} | {date:date} | ',
        '{department:option["Engineering","Finance"]}',
      ],
      ['{/items}'],
    ]);

    const output = renderTemplate(template, {
      title: 'Expenses',
      items: [
        {
          description: 'Hotel',
          amount: 500,
          enabled: true,
          date: new Date('2026-09-20T10:00:00.000Z'),
          department: 'Engineering',
        },
        {
          description: '交通',
          amount: 200.5,
          enabled: false,
          date: new Date('2026-09-21T10:00:00.000Z'),
          department: 'Finance',
        },
      ],
    });

    const documentXml = readDocumentXml(output);
    expect(documentXml).toContain('Report: Expenses');
    expect(documentXml).toContain('Hotel | 500 | true | 2026-09-20 | ');
    expect(documentXml).toContain('Engineering');
    expect(documentXml).toContain('交通 | 200.5 | false | 2026-09-21 | ');
    expect(documentXml).toContain('Finance');
  });

  it('renders a real DOCX table-row loop for every collection item', () => {
    const template = createDocxWithTableRow([
      ['{#items}{description}'],
      ['{amount:number}{/items}'],
    ]);

    const output = renderTemplate(template, {
      items: [
        { description: 'Hotel', amount: 500 },
        { description: 'Transport', amount: 200 },
      ],
    });

    const documentXml = readDocumentXml(output);
    expect(documentXml.match(/<w:tr>/g)).toHaveLength(2);
    expect(documentXml).toContain('Hotel');
    expect(documentXml).toContain('500');
    expect(documentXml).toContain('Transport');
    expect(documentXml).toContain('200');
  });

  it('renders multiple root collections independently', () => {
    const template = createDocx([
      ['{#items}'],
      ['Item: {name}'],
      ['{/items}'],
      ['{#approvals}'],
      ['Approved: {name}'],
      ['{/approvals}'],
    ]);

    const output = renderTemplate(template, {
      items: [{ name: 'Laptop' }, { name: 'Monitor' }],
      approvals: [{ name: 'Alice' }],
    });

    const documentXml = readDocumentXml(output);
    expect(documentXml).toContain('Item: Laptop');
    expect(documentXml).toContain('Item: Monitor');
    expect(documentXml).toContain('Approved: Alice');
  });

  it('uses the same API for a records collection in one document', () => {
    const template = createDocx([['{#records}'], ['姓名：{姓名}'], ['{/records}']]);

    const output = renderTemplate(template, {
      records: [{ 姓名: '张三' }, { 姓名: '李四' }],
    });

    const documentXml = readDocumentXml(output);
    expect(documentXml).toContain('姓名：张三');
    expect(documentXml).toContain('姓名：李四');
  });

  it('allows an empty collection', () => {
    const template = createDocx([['Before'], ['{#items}'], ['{name}'], ['{/items}'], ['After']]);

    const output = renderTemplate(template, { items: [] });
    const documentXml = readDocumentXml(output);

    expect(documentXml).toContain('Before');
    expect(documentXml).toContain('After');
    expect(documentXml).not.toContain('{name}');
  });

  it('reports a missing referenced scalar without treating null as missing', () => {
    const template = createDocx([['{name}'], ['{notes}']]);

    const error = captureError(() => renderTemplate(template, { name: null }));

    expect(error).toBeInstanceOf(MissingInputFieldError);
    expect(error).toMatchObject({
      code: 'MissingInputField',
      fieldName: 'notes',
      dataPath: ['notes'],
      reason: 'MissingScalarField',
    });
  });

  it('reports a missing collection and a missing collection-item field with data paths', () => {
    const template = createDocx([['{#items}'], ['{name} {amount:number}'], ['{/items}']]);

    const missingCollection = captureError(() => renderTemplate(template, {}));
    const missingItemField = captureError(() =>
      renderTemplate(template, { items: [{ name: 'Hotel' }] }),
    );

    expect(missingCollection).toBeInstanceOf(MissingInputFieldError);
    expect(missingCollection).toMatchObject({
      fieldName: 'items',
      dataPath: ['items'],
      reason: 'MissingCollection',
    });
    expect(missingItemField).toBeInstanceOf(MissingInputFieldError);
    expect(missingItemField).toMatchObject({
      fieldName: 'amount',
      dataPath: ['items', 0, 'amount'],
      reason: 'MissingCollectionItemField',
    });
  });

  it('does not use a root field to satisfy a missing collection-item field', () => {
    const template = createDocx([['Root: {name}'], ['{#items}'], ['Item: {name}'], ['{/items}']]);

    const error = captureError(() =>
      renderTemplate(template, {
        name: 'Root name',
        items: [{}],
      }),
    );

    expect(error).toBeInstanceOf(MissingInputFieldError);
    expect(error).toMatchObject({
      dataPath: ['items', 0, 'name'],
      reason: 'MissingCollectionItemField',
    });
  });

  it.each([
    ['null collection', { items: null }, ['items'], 'InvalidCollectionValue'],
    ['scalar collection', { items: 'not-an-array' }, ['items'], 'InvalidCollectionValue'],
    ['primitive item', { items: ['not-a-record'] }, ['items', 0], 'InvalidCollectionItem'],
    ['null item', { items: [null] }, ['items', 0], 'InvalidCollectionItem'],
    [
      'nested collection',
      { items: [{ name: ['nested'] }] },
      ['items', 0, 'name'],
      'InvalidCollectionItemValue',
    ],
    [
      'undefined item value',
      { items: [{ name: undefined }] },
      ['items', 0, 'name'],
      'InvalidCollectionItemValue',
    ],
  ] as const)('rejects a malformed %s with its data path', (_label, data, dataPath, reason) => {
    const template = createDocx([['{#items}'], ['{name}'], ['{/items}']]);

    const error = captureError(() =>
      renderTemplate(template, data as unknown as Parameters<typeof renderTemplate>[1]),
    );

    expect(error).toBeInstanceOf(InvalidInputValueError);
    expect(error).toMatchObject({ code: 'InvalidInputValue', dataPath, reason });
  });

  it.each([
    ['{amount:number}', { amount: Number.NaN }, ['amount']],
    ['{amount:number}', { amount: Number.POSITIVE_INFINITY }, ['amount']],
    ['{birthday:date}', { birthday: new Date(Number.NaN) }, ['birthday']],
    ['{enabled:boolean}', { enabled: 'false' }, ['enabled']],
  ] as const)('reports an invalid normalized scalar value for %s', (tag, record, dataPath) => {
    const template = createDocx([[tag]]);
    const error = captureError(() => renderTemplate(template, record));

    expect(error).toBeInstanceOf(InvalidInputValueError);
    expect(error).toMatchObject({ dataPath, reason: 'InvalidScalarValue' });
  });

  it('reports an invalid typed collection-item value with its indexed data path', () => {
    const template = createDocx([['{#items}'], ['{amount:number}'], ['{/items}']]);

    const error = captureError(() =>
      renderTemplate(template, {
        items: [{ amount: 1 }, { amount: Number.NaN }],
      }),
    );

    expect(error).toBeInstanceOf(InvalidInputValueError);
    expect(error).toMatchObject({
      dataPath: ['items', 1, 'amount'],
      reason: 'InvalidCollectionItemValue',
    });
  });

  it('rejects an explicit undefined root value instead of treating it as null', () => {
    const template = createDocx([['{name}']]);
    const record = { name: undefined } as unknown as Parameters<typeof renderTemplate>[1];

    const error = captureError(() => renderTemplate(template, record));

    expect(error).toBeInstanceOf(InvalidInputValueError);
    expect(error).toMatchObject({
      dataPath: ['name'],
      reason: 'InvalidScalarValue',
    });
  });

  it('wraps unexpected data access failures and retains their cause', () => {
    const template = createDocx([['{name}']]);
    const cause = new Error('Record access failed.');
    const record = Object.defineProperty({}, 'name', {
      enumerable: true,
      get(): never {
        throw cause;
      },
    });

    const error = captureError(() => renderTemplate(template, record));

    expect(error).toBeInstanceOf(RenderFailedError);
    expect(error).toMatchObject({ code: 'RenderFailed', cause });
  });

  it('maps corrupted input to the existing invalid template error', () => {
    expect(() => renderTemplate(Buffer.from('not a DOCX file'), {})).toThrow(InvalidTemplateError);
  });

  it('maps invalid template syntax before attempting to render', () => {
    const template = createDocx([['{name']]);

    expect(() => renderTemplate(template, { name: 'Alice' })).toThrow(InvalidTemplateError);
  });
});

function readDocumentXml(document: Buffer): string {
  const zip = new PizZip(document);
  expect(zip.file('[Content_Types].xml')).not.toBeNull();
  expect(zip.file('word/document.xml')).not.toBeNull();
  return zip.file('word/document.xml')?.asText() ?? '';
}

function captureError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  return undefined;
}
