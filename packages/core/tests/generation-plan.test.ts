import { describe, expect, it } from 'vitest';
import { derivePublicationManifest, prepareGeneration, prepareTemplate } from '@/index.js';
import { createDocx } from './docx-fixture.js';

describe('generation planning', () => {
  it('treats interpolated values as segments and sanitizes path separators', () => {
    const result = prepare(['department', 'name'], [{ department: '../../Windows', name: 'A/B' }], {
      naming: { kind: 'template', pathTemplate: '{department}/{name}.docx' },
      documentOutputs: 'docx',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { plan: { documents: [{ docxPath: '.._.._Windows/A_B.docx' }] } },
      warnings: expect.arrayContaining([
        expect.objectContaining({
          stage: 'planning',
          issue: expect.objectContaining({ code: 'NamingValueSanitized', fieldName: 'department' }),
        }),
        expect.objectContaining({
          stage: 'planning',
          issue: expect.objectContaining({ code: 'NamingValueSanitized', fieldName: 'name' }),
        }),
      ]),
    });
  });

  it.each(['../result.docx', '/result.docx', 'safe\\result.docx'])(
    'rejects unsafe literal path %s',
    (fileName) => {
      expect(
        prepare(['name'], [{ name: 'A' }], {
          naming: { kind: 'single', fileName },
          documentOutputs: 'docx',
        }),
      ).toMatchObject({ ok: false, errors: [{ stage: 'planning' }] });
    },
  );

  it('detects collisions after dynamic-value sanitization', () => {
    const result = prepare(['name'], [{ name: 'A/B' }, { name: 'A\\B' }], {
      naming: { kind: 'template', pathTemplate: '{name}.docx' },
      documentOutputs: 'docx',
    });
    expect(result).toMatchObject({
      ok: false,
      errors: [{ stage: 'planning', issue: { code: 'DuplicateArtifactPath', path: 'A_B.docx' } }],
    });
  });

  it('keeps a canonical DOCX path for PDF-only output and derives the published PDF name', () => {
    const result = prepare(['name'], [{ name: 'A' }], {
      naming: { kind: 'single', fileName: 'chosen.pdf' },
      documentOutputs: 'pdf',
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.value.plan.documents[0]!.docxPath).toBe('chosen.docx');
    expect(derivePublicationManifest(result.value.plan).items).toEqual([
      { artifactId: 'document-0:pdf', kind: 'pdf', relativePath: 'chosen.pdf' },
    ]);
  });

  it('uses one-based $index and canonical date and datetime naming formats', () => {
    const result = prepare(
      ['day:date', 'instant:datetime'],
      [{ day: '2024-01-02', instant: '2024-01-02T03:04:05Z' }],
      {
        naming: { kind: 'template', pathTemplate: '{$index}-{day}-{instant}.docx' },
        documentOutputs: 'docx',
      },
      { timeZone: 'UTC' },
    );
    expect(result).toMatchObject({
      ok: true,
      value: { plan: { documents: [{ docxPath: '1-2024-01-02-2024-01-02_03-04-05.docx' }] } },
    });
  });
});

function prepare(
  tags: readonly string[],
  rows: readonly unknown[],
  request: Parameters<typeof prepareGeneration>[0]['request'],
  renderOptions?: Parameters<typeof prepareGeneration>[0]['renderOptions'],
) {
  const template = prepareTemplate(createDocx(tags.map((tag) => [`{${tag}}`])));
  if (!template.ok) throw new Error(JSON.stringify(template.errors));
  return prepareGeneration({
    template: template.value,
    input: { kind: 'object-rows', rows },
    request,
    ...(renderOptions === undefined ? {} : { renderOptions }),
  });
}
