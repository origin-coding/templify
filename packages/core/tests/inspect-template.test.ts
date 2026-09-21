import { describe, expect, it } from 'vitest';

import {
  ConflictingFieldDefinitionError,
  InvalidTemplateError,
  InvalidTemplateTagError,
  UnsupportedTemplateTagError,
  inspectTemplate,
} from '../src/index.js';
import { createDocx } from './docx-fixture.js';

describe('inspectTemplate', () => {
  it('discovers scalar fields in first-appearance order across split Word runs', () => {
    const template = createDocx([
      ['{name}'],
      ['{birth', 'day:date}'],
      ['{amount:number}'],
      ['{name:string}'],
      ['{department:option["Engineering","Finance"]}'],
    ]);

    expect(inspectTemplate(template)).toEqual([
      { kind: 'scalar', name: 'name', hint: { type: 'string' } },
      { kind: 'scalar', name: 'birthday', hint: { type: 'date' } },
      { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
      {
        kind: 'scalar',
        name: 'department',
        hint: { type: 'option', values: ['Engineering', 'Finance'] },
      },
    ]);
  });

  it('discovers one-level collections and their typed fields', () => {
    const template = createDocx([
      ['{title}'],
      ['{#it', 'ems}'],
      ['{description}'],
      ['{amount:number}'],
      ['{/items}'],
    ]);

    expect(inspectTemplate(template)).toEqual([
      { kind: 'scalar', name: 'title', hint: { type: 'string' } },
      {
        kind: 'collection',
        name: 'items',
        fields: [
          { kind: 'scalar', name: 'description', hint: { type: 'string' } },
          { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
        ],
      },
    ]);
  });

  it('deduplicates compatible scalar fields in the same scope', () => {
    const template = createDocx([['{name}'], ['{name:string}'], ['{name}']]);

    expect(inspectTemplate(template)).toEqual([
      { kind: 'scalar', name: 'name', hint: { type: 'string' } },
    ]);
  });

  it('merges compatible repeated collection definitions in first-appearance order', () => {
    const template = createDocx([
      ['{#items}'],
      ['{name}'],
      ['{/items}'],
      ['{#items}'],
      ['{amount:number}'],
      ['{name:string}'],
      ['{/items}'],
    ]);

    expect(inspectTemplate(template)).toEqual([
      {
        kind: 'collection',
        name: 'items',
        fields: [
          { kind: 'scalar', name: 'name', hint: { type: 'string' } },
          { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
        ],
      },
    ]);
  });

  it('allows the same child name to use different hints in different collections', () => {
    const template = createDocx([
      ['{#items}'],
      ['{value:number}'],
      ['{/items}'],
      ['{#approvals}'],
      ['{value:boolean}'],
      ['{/approvals}'],
    ]);

    expect(inspectTemplate(template)).toEqual([
      {
        kind: 'collection',
        name: 'items',
        fields: [{ kind: 'scalar', name: 'value', hint: { type: 'number' } }],
      },
      {
        kind: 'collection',
        name: 'approvals',
        fields: [{ kind: 'scalar', name: 'value', hint: { type: 'boolean' } }],
      },
    ]);
  });

  it('supports Unicode collection and child-field names', () => {
    const template = createDocx([['{#明细}'], ['{说明}'], ['{金额:number}'], ['{/明细}']]);

    expect(inspectTemplate(template)).toEqual([
      {
        kind: 'collection',
        name: '明细',
        fields: [
          { kind: 'scalar', name: '说明', hint: { type: 'string' } },
          { kind: 'scalar', name: '金额', hint: { type: 'number' } },
        ],
      },
    ]);
  });

  it.each([
    [['{name:string}'], ['{name:number}']],
    [['{#items}'], ['{value:string}'], ['{value:number}'], ['{/items}']],
    [['{items}'], ['{#items}'], ['{value}'], ['{/items}']],
  ])('rejects conflicting definitions in the same scope', (...paragraphs) => {
    const template = createDocx(paragraphs);

    expect(() => inspectTemplate(template)).toThrow(ConflictingFieldDefinitionError);
  });

  it('allows root and collection-item fields to use the same name', () => {
    const template = createDocx([['{name:number}'], ['{#items}'], ['{name:string}'], ['{/items}']]);

    expect(inspectTemplate(template)).toEqual([
      { kind: 'scalar', name: 'name', hint: { type: 'number' } },
      {
        kind: 'collection',
        name: 'items',
        fields: [{ kind: 'scalar', name: 'name', hint: { type: 'string' } }],
      },
    ]);
  });

  it('rejects nested collections', () => {
    const template = createDocx([
      ['{#groups}'],
      ['{name}'],
      ['{#members}'],
      ['{name}'],
      ['{/members}'],
      ['{/groups}'],
    ]);

    expect(() => inspectTemplate(template)).toThrow(UnsupportedTemplateTagError);
  });

  it('rejects inverted loops and collection type hints', () => {
    const inverted = createDocx([['{^items}'], ['{name}'], ['{/items}']]);
    const typedCollection = createDocx([['{#items:string}'], ['{name}'], ['{/items:string}']]);

    expect(() => inspectTemplate(inverted)).toThrow(UnsupportedTemplateTagError);
    expect(() => inspectTemplate(typedCollection)).toThrow(InvalidTemplateTagError);
  });

  it.each([
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
