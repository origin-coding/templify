import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  InvalidInputValueError,
  InvalidTemplateError,
  MissingInputFieldError,
  RenderFailedError,
  renderTemplate,
} from '../src/index.js';
import { createDocx } from './docx-fixture.js';

describe('renderTemplate', () => {
  it('renders one normalized record into a structurally valid DOCX buffer', () => {
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
      notes: 'A & B <\u516c\u53f8>',
      empty: null,
      extra: 'ignored',
    });

    expect(output).toBeInstanceOf(Buffer);
    expect(output.byteLength).toBeGreaterThan(0);

    const zip = new PizZip(output);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('word/document.xml')).not.toBeNull();

    const documentXml = zip.file('word/document.xml')?.asText() ?? '';
    expect(documentXml.match(/Alice/g)).toHaveLength(3);
    expect(documentXml).toContain('1234.5');
    expect(documentXml).toContain('false');
    expect(documentXml).toContain('2026-09-20');
    expect(documentXml).toContain('Engineering');
    expect(documentXml).toContain('A &amp; B &lt;\u516c\u53f8&gt;');
    expect(documentXml).not.toContain('{name}');
    expect(documentXml).not.toContain('{name:string}');
    expect(documentXml).not.toContain('{birthday:date}');
  });

  it('reports a missing referenced field without treating null as missing', () => {
    const template = createDocx([['{name}'], ['{notes}']]);

    const error = captureError(() => renderTemplate(template, { name: null }));

    expect(error).toBeInstanceOf(MissingInputFieldError);
    expect(error).toMatchObject({ code: 'MissingInputField', fieldName: 'notes' });
  });

  it.each([
    ['{amount:number}', { amount: Number.NaN }],
    ['{amount:number}', { amount: Number.POSITIVE_INFINITY }],
    ['{birthday:date}', { birthday: new Date(Number.NaN) }],
    ['{enabled:boolean}', { enabled: 'false' }],
  ] as const)('reports an invalid normalized value for %s', (tag, record) => {
    const template = createDocx([[tag]]);

    expect(() => renderTemplate(template, record)).toThrow(InvalidInputValueError);
  });

  it('rejects an explicit undefined value instead of treating it as null', () => {
    const template = createDocx([['{name}']]);
    const record = { name: undefined } as unknown as Record<string, null>;

    expect(() => renderTemplate(template, record)).toThrow(InvalidInputValueError);
  });

  it('wraps unexpected rendering failures and retains their cause', () => {
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

function captureError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  return undefined;
}
