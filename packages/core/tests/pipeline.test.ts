import PizZip from 'pizzip';
import { describe, expect, it, vi } from 'vitest';

import {
  derivePublicationManifest,
  generateArtifacts,
  packageArtifacts,
  prepareGeneration,
  prepareTemplate,
  type PdfConverter,
  type PdfMerger,
} from '@/index.js';
import { createDocx } from './docx-fixture.js';

const pdf = new TextEncoder().encode('%PDF-1.7\nfixture');

describe('core pipeline', () => {
  it('prepares once, normalizes unknown rows, plans, and renders in memory', async () => {
    const template = prepareTemplate(createDocx([['{name:string}'], ['{amount:number}']]));
    expect(template.ok).toBe(true);
    if (!template.ok) return;

    const prepared = prepareGeneration({
      template: template.value,
      input: { kind: 'object-rows', rows: [{ name: 123, amount: '1.5', ignored: true }] },
      renderOptions: { locale: 'en', timeZone: 'UTC' },
      request: {
        naming: { kind: 'single', fileName: 'result.docx' },
        documentOutputs: 'docx',
      },
    });
    expect(prepared.ok).toBe(true);
    expect(prepared.warnings).toEqual([
      expect.objectContaining({
        stage: 'input',
        issue: expect.objectContaining({ code: 'ExtraInputFieldsIgnored' }),
      }),
    ]);
    if (!prepared.ok) return;

    const generated = await generateArtifacts(prepared.value);
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    expect(generated.value.artifacts).toHaveLength(1);
    const xml = new PizZip(generated.value.artifacts[0]!.bytes).file('word/document.xml')!.asText();
    expect(xml).toContain('123');
    expect(xml).toContain('1.5');
    expect(derivePublicationManifest(prepared.value.plan).items).toEqual([
      { artifactId: 'document-0:docx', kind: 'docx', relativePath: 'result.docx' },
    ]);
  });

  it('converts each document once, merges PDFs, and packages the complete set as ZIP', async () => {
    const template = prepareTemplate(createDocx([['{name}']]));
    if (!template.ok) throw new Error('fixture must prepare');
    const prepared = prepareGeneration({
      template: template.value,
      input: { kind: 'object-rows', rows: [{ name: 'A' }, { name: 'B' }] },
      request: {
        naming: { kind: 'template', pathTemplate: '{$index}-{name}.docx' },
        documentOutputs: 'docx-and-pdf',
        aggregates: [{ kind: 'merged-pdf', relativePath: 'all.pdf' }],
        bundle: { kind: 'zip', fileName: 'bundle.zip' },
      },
    });
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.errors));
    const converter: PdfConverter = {
      id: 'test',
      getAvailability: vi.fn<PdfConverter['getAvailability']>(async () => ({ available: true })),
      convert: vi.fn<PdfConverter['convert']>(async () => ({ bytes: pdf, losses: [] })),
    };
    const merger: PdfMerger = { merge: vi.fn<PdfMerger['merge']>(async () => pdf) };
    const generated = await generateArtifacts(prepared.value, {
      pdfConverter: converter,
      pdfMerger: merger,
    });
    expect(generated.ok).toBe(true);
    expect(converter.convert).toHaveBeenCalledTimes(2);
    expect(merger.merge).toHaveBeenCalledTimes(1);
    if (!generated.ok) return;
    expect(generated.value.artifacts.map((item) => item.kind)).toEqual([
      'docx',
      'pdf',
      'docx',
      'pdf',
      'merged-pdf',
    ]);
    const packaged = packageArtifacts(prepared.value.plan, generated.value);
    expect(packaged.ok).toBe(true);
    if (!packaged.ok) return;
    expect(packaged.value.artifacts).toHaveLength(1);
    const zip = new PizZip(packaged.value.artifacts[0]!.bytes);
    expect(Object.keys(zip.files).sort()).toEqual([
      '1-A.docx',
      '1-A.pdf',
      '2-B.docx',
      '2-B.pdf',
      'all.pdf',
    ]);
  });

  it('repairs dynamic reserved names but rejects the same name when it is literal', () => {
    const template = prepareTemplate(createDocx([['{name}']]));
    if (!template.ok) throw new Error('fixture must prepare');
    const dynamic = prepareGeneration({
      template: template.value,
      input: { kind: 'object-rows', rows: [{ name: 'CON' }] },
      request: {
        naming: { kind: 'template', pathTemplate: '{name}.docx' },
        documentOutputs: 'docx',
      },
    });
    expect(dynamic.ok).toBe(true);
    if (!dynamic.ok) throw new Error(JSON.stringify(dynamic.errors));
    expect(dynamic.value.plan.documents[0]!.docxPath).toBe('_CON.docx');
    expect(dynamic.warnings).toContainEqual(expect.objectContaining({ stage: 'planning' }));

    const literal = prepareGeneration({
      template: template.value,
      input: { kind: 'object-rows', rows: [{ name: 'safe' }] },
      request: { naming: { kind: 'single', fileName: 'CON.docx' }, documentOutputs: 'docx' },
    });
    expect(literal.ok).toBe(false);
  });

  it('returns i18n-neutral data paths and one-based source row numbers', () => {
    const template = prepareTemplate(createDocx([['{enabled:boolean}']]));
    if (!template.ok) throw new Error('fixture must prepare');
    const prepared = prepareGeneration({
      template: template.value,
      input: {
        kind: 'tabular',
        columns: ['enabled'],
        rows: [[1]],
        origins: [{ sourceRowNumber: 2 }],
      },
      request: { naming: { kind: 'single', fileName: 'result.docx' }, documentOutputs: 'docx' },
    });
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.errors[0]).toEqual({
      stage: 'input',
      issue: expect.objectContaining({
        code: 'InvalidInputValue',
        location: { inputRowIndex: 0, sourceRowNumber: 2, path: ['enabled'] },
      }),
    });
  });
});
