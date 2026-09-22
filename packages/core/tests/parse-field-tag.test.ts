import { describe, expect, it } from 'vitest';

import {
  InvalidTemplateTagError,
  UnsupportedTemplateTagError,
  parseFieldTag,
} from '../src/index.js';

describe('parseFieldTag', () => {
  it.each([
    ['name', { kind: 'scalar', name: 'name', hint: { type: 'string' } }],
    ['name:string', { kind: 'scalar', name: 'name', hint: { type: 'string' } }],
    ['amount:number', { kind: 'scalar', name: 'amount', hint: { type: 'number' } }],
    ['enabled:boolean', { kind: 'scalar', name: 'enabled', hint: { type: 'boolean' } }],
    ['birthday:date', { kind: 'scalar', name: 'birthday', hint: { type: 'date' } }],
    ['createdAt:datetime', { kind: 'scalar', name: 'createdAt', hint: { type: 'datetime' } }],
    ['姓名:string', { kind: 'scalar', name: '姓名', hint: { type: 'string' } }],
  ])('parses %s', (tag, expected) => {
    expect(parseFieldTag(tag)).toEqual(expected);
  });

  it('trims field names and hints', () => {
    expect(parseFieldTag('  name : date  ')).toEqual({
      kind: 'scalar',
      name: 'name',
      hint: { type: 'date' },
    });
  });

  it('parses option values with punctuation and escaped quotes', () => {
    expect(
      parseFieldTag('department:option["Engineering, APAC","Office: North","Say \\"Hi\\""]'),
    ).toEqual({
      kind: 'scalar',
      name: 'department',
      hint: {
        type: 'option',
        values: ['Engineering, APAC', 'Office: North', 'Say "Hi"'],
      },
    });
  });

  it.each(['', '   ', 'bad:name:string', 'bad{name', 'bad}name', 'bad\u0000name'])(
    'rejects the invalid field tag %j',
    (tag) => {
      expect(() => parseFieldTag(tag)).toThrow(InvalidTemplateTagError);
    },
  );

  it.each([
    'name:text',
    'name:',
    'name:option',
    'name:option["open",]',
    'name:option{"open":true}',
    'name:option["open",1]',
  ])('rejects the invalid hint in %s', (tag) => {
    expect(() => parseFieldTag(tag)).toThrow(InvalidTemplateTagError);
  });

  it.each(['#records', '/records', '@rawXml', '%image', '~~html', ':subtemplate', '$chart'])(
    'rejects unsupported tag syntax %s',
    (tag) => {
      expect(() => parseFieldTag(tag)).toThrow(UnsupportedTemplateTagError);
    },
  );
});
