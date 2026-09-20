import { describe, expect, it } from 'vitest';

import {
  ConflictingFieldDefinitionError,
  InvalidTemplateError,
  UnsupportedTemplateTagError,
  inspectTemplate,
} from '../src/index.js';
import { createDocx } from './docx-fixture.js';

describe('inspectTemplate', () => {
  it('discovers fields in first-appearance order across split Word runs', () => {
    const template = createDocx([
      ['{name}'],
      ['{birth', 'day:date}'],
      ['{amount:number}'],
      ['{name:string}'],
      ['{department:option["Engineering","Finance"]}'],
    ]);

    expect(inspectTemplate(template)).toEqual([
      { name: 'name', hint: { type: 'string' } },
      { name: 'birthday', hint: { type: 'date' } },
      { name: 'amount', hint: { type: 'number' } },
      {
        name: 'department',
        hint: { type: 'option', values: ['Engineering', 'Finance'] },
      },
    ]);
  });

  it('deduplicates compatible explicit and implicit string fields', () => {
    const template = createDocx([['{name}'], ['{name:string}'], ['{name}']]);

    expect(inspectTemplate(template)).toEqual([{ name: 'name', hint: { type: 'string' } }]);
  });

  it('rejects conflicting field definitions', () => {
    const template = createDocx([['{name:string}'], ['{name:number}']]);

    expect(() => inspectTemplate(template)).toThrow(ConflictingFieldDefinitionError);
  });

  it.each([
    { paragraphs: [['{#records}'], ['{name}'], ['{/records}']] },
    { paragraphs: [['{@rawXml}']] },
    { paragraphs: [['{%image}']] },
    { paragraphs: [['{~~html}']] },
    { paragraphs: [['{:subtemplate}']] },
    { paragraphs: [['{$chart}']] },
  ])('rejects unsupported structured or prefixed tags', ({ paragraphs }) => {
    const template = createDocx(paragraphs);

    expect(() => inspectTemplate(template)).toThrow(UnsupportedTemplateTagError);
  });

  it('maps unclosed tags to an invalid template error', () => {
    const template = createDocx([['{name']]);

    expect(() => inspectTemplate(template)).toThrow(InvalidTemplateError);
  });

  it('maps corrupted input to an invalid template error with its cause', () => {
    const error = captureError(() => inspectTemplate(Buffer.from('not a DOCX file')));

    expect(error).toBeInstanceOf(InvalidTemplateError);
    expect((error as InvalidTemplateError).cause).toBeDefined();
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
