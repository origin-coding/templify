import { describe, expect, it } from 'vitest';

import {
  InvalidTemplateTagError,
  UnsupportedTemplateTagError,
  parseFieldTag,
} from '../src/index.js';

describe('parseFieldTag', () => {
  it.each([
    ['name', { name: 'name', hint: { type: 'string' } }],
    ['name:string', { name: 'name', hint: { type: 'string' } }],
    ['amount:number', { name: 'amount', hint: { type: 'number' } }],
    ['enabled:boolean', { name: 'enabled', hint: { type: 'boolean' } }],
    ['birthday:date', { name: 'birthday', hint: { type: 'date' } }],
    ['姓名:string', { name: '姓名', hint: { type: 'string' } }],
  ])('parses %s', (tag, expected) => {
    expect(parseFieldTag(tag)).toEqual(expected);
  });

  it('trims field names and hints', () => {
    expect(parseFieldTag('  name : date  ')).toEqual({ name: 'name', hint: { type: 'date' } });
  });

  it('parses option values with punctuation and escaped quotes', () => {
    expect(
      parseFieldTag('department:option["Engineering, APAC","Office: North","Say \\"Hi\\""]'),
    ).toEqual({
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
