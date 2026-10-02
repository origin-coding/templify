import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import {
  createFieldValueFormatter,
  generateArtifacts,
  prepareGeneration,
  prepareTemplate,
  validateRenderOptions,
  type RenderOptions,
  type TemplateDefinition,
} from '@/index';
import { createDocx } from './docx-fixture';

const definition: TemplateDefinition = {
  version: 1,
  kind: 'docx',
  fields: [
    { kind: 'scalar', name: 'enabled', hint: { type: 'boolean' } },
    { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
    {
      kind: 'collection',
      name: 'items',
      fields: [{ kind: 'scalar', name: 'approved', hint: { type: 'boolean' } }],
    },
  ],
};

describe('type defaults and field overrides', () => {
  it('applies defaults to collection children and completely replaces them for individual fields', () => {
    const result = validateRenderOptions(definition, {
      defaults: {
        boolean: { trueText: '是', falseText: '否' },
        number: { currency: 'USD', minimumFractionDigits: 2 },
      },
      formats: [
        {
          path: ['items', 'approved'],
          format: { type: 'boolean', trueText: 'Pass', falseText: 'Fail' },
        },
        {
          path: ['amount'],
          format: { type: 'number', useGrouping: false, maximumFractionDigits: 1 },
        },
      ],
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const formatter = createFieldValueFormatter(result.value);
    const enabled = definition.fields[0]!;
    const amount = definition.fields[1]!;
    const items = definition.fields[2]!;
    if (enabled.kind !== 'scalar' || amount.kind !== 'scalar' || items.kind !== 'collection')
      throw new Error('fixture');
    expect(formatter.format(enabled, true, ['enabled'])).toBe('是');
    expect(formatter.format(enabled, null, ['enabled'])).toBe('');
    expect(formatter.format(items.fields[0]!, false, ['items', 'approved'])).toBe('Fail');
    expect(formatter.format(amount, 1234.56, ['amount'])).toBe('1234.6');
    expect(validateRenderOptions(definition).ok).toBe(true);
  });
  it('rejects invalid defaults even when the template has no matching fields', () => {
    for (const defaults of [
      { number: { minimumFractionDigits: 4, maximumFractionDigits: 1 } },
      { date: { pattern: 'invalid' } },
      { datetime: { timeZone: 'invalid' } },
      { boolean: { trueText: 1, falseText: 'No' } },
      { string: {} },
      { date: { type: 'date' } },
    ]) {
      expect(
        validateRenderOptions({ ...definition, fields: [] }, {
          defaults,
        } as unknown as RenderOptions).ok,
      ).toBe(false);
    }
  });
  it('renders real DOCX output with type defaults and keeps canonical behavior when rules are absent', async () => {
    const template = prepareTemplate(
      createDocx([
        ['{enabled:boolean}'],
        ['{amount:number}'],
        ['{day:date}'],
        ['{created:datetime}'],
      ]),
    );
    if (!template.ok) throw new Error('fixture');
    const options: RenderOptions = {
      timeZone: 'UTC',
      defaults: {
        boolean: { trueText: 'Yes', falseText: 'No' },
        number: { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 },
        date: { pattern: 'YYYY年MM月DD日' },
        datetime: { timeZone: 'Asia/Shanghai', pattern: 'YYYY-MM-DD HH:mm' },
      },
    };
    const generation = prepareGeneration({
      template: template.value,
      input: {
        kind: 'object-rows',
        rows: [{ enabled: false, amount: 12, day: '2026-01-02', created: '2026-01-02T03:04:05Z' }],
      },
      renderOptions: options,
      request: { naming: { kind: 'single', fileName: 'result.docx' }, documentOutputs: 'docx' },
    });
    if (!generation.ok) throw new Error(JSON.stringify(generation.errors));
    const generated = await generateArtifacts(generation.value);
    if (!generated.ok) throw new Error(JSON.stringify(generated.errors));
    const xml = new PizZip(generated.value.artifacts[0]!.bytes).file('word/document.xml')!.asText();
    for (const text of ['No', '12.00', '2026年01月02日', '2026-01-02 11:04'])
      expect(xml).toContain(text);
  });
});
