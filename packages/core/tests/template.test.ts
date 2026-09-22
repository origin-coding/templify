import { describe, expect, it } from 'vitest';
import { prepareTemplate } from '@/index.js';
import { parseFieldTag } from '@/template/parse-field-tag.js';
import { createDocx } from './docx-fixture.js';

describe('template preparation', () => {
  it.each([
    ['name', { kind: 'scalar', name: 'name', hint: { type: 'string' } }],
    ['amount:number', { kind: 'scalar', name: 'amount', hint: { type: 'number' } }],
    ['enabled:boolean', { kind: 'scalar', name: 'enabled', hint: { type: 'boolean' } }],
    ['birthday:date', { kind: 'scalar', name: 'birthday', hint: { type: 'date' } }],
    ['createdAt:datetime', { kind: 'scalar', name: 'createdAt', hint: { type: 'datetime' } }],
    ['姓名:string', { kind: 'scalar', name: '姓名', hint: { type: 'string' } }],
  ])('parses %s', (tag, expected) => expect(parseFieldTag(tag)).toEqual(expected));

  it('parses option values containing punctuation and escaped quotes', () => {
    expect(
      parseFieldTag('department:option["Engineering, APAC","Office: North","Say \\"Hi\\""]'),
    ).toEqual({
      kind: 'scalar',
      name: 'department',
      hint: { type: 'option', values: ['Engineering, APAC', 'Office: North', 'Say "Hi"'] },
    });
  });

  it.each(['', 'bad:name:string', 'bad{name', 'name:text', 'name:option["open",]'])(
    'rejects invalid tag syntax %j',
    (tag) => expect(() => parseFieldTag(tag)).toThrow('InvalidTemplateTag'),
  );

  it('discovers fields in first-appearance order and deduplicates compatible tags', () => {
    const result = prepareTemplate(
      createDocx([
        ['{name}'],
        ['{birth', 'day:date}'],
        ['{name:string}'],
        ['{department:option["Engineering","Finance"]}'],
      ]),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        definition: {
          fields: [
            { kind: 'scalar', name: 'name', hint: { type: 'string' } },
            { kind: 'scalar', name: 'birthday', hint: { type: 'date' } },
            {
              kind: 'scalar',
              name: 'department',
              hint: { type: 'option', values: ['Engineering', 'Finance'] },
            },
          ],
        },
      },
    });
  });

  it('discovers one-level collections and rejects nested collections', () => {
    const accepted = prepareTemplate(
      createDocx([['{#items}'], ['{description}'], ['{amount:number}'], ['{/items}']]),
    );
    expect(accepted).toMatchObject({
      ok: true,
      value: {
        definition: {
          fields: [
            {
              kind: 'collection',
              name: 'items',
              fields: [
                { kind: 'scalar', name: 'description', hint: { type: 'string' } },
                { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
              ],
            },
          ],
        },
      },
    });
    const nested = prepareTemplate(
      createDocx([['{#groups}'], ['{#members}'], ['{name}'], ['{/members}'], ['{/groups}']]),
    );
    expect(nested).toMatchObject({
      ok: false,
      errors: [{ code: 'UnsupportedTemplateTag', reason: 'NestedCollection' }],
    });
  });

  it('returns structured diagnostics for conflicts and corrupt input', () => {
    expect(prepareTemplate(createDocx([['{name:string}'], ['{name:number}']]))).toMatchObject({
      ok: false,
      errors: [{ code: 'ConflictingFieldDefinition', fieldName: 'name' }],
    });
    expect(prepareTemplate(new TextEncoder().encode('not a docx'))).toMatchObject({
      ok: false,
      errors: [{ code: 'InvalidTemplate' }],
    });
  });
});
