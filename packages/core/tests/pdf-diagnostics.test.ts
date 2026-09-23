import { describe, expect, it } from 'vitest';

import {
  generateArtifacts,
  prepareGeneration,
  prepareTemplate,
  type Generation,
  type PdfConverter,
  type PdfMerger,
} from '@/index';
import { createDocx } from './docx-fixture';

const pdf = new TextEncoder().encode('%PDF-1.7\nfixture');

describe('PDF generation diagnostics', () => {
  it('identifies the record and planned PDF path when conversion throws', async () => {
    const generation = prepare('pdf');
    let conversions = 0;
    const converter = fakeConverter(async () => {
      conversions += 1;
      if (conversions === 2) throw new Error('private converter detail');
      return { bytes: pdf, losses: [] };
    });

    const result = await generateArtifacts(generation, { pdfConverter: converter });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: 'PdfConversionFailed',
          converterId: 'test',
          documentId: 'document-1',
          recordIndex: 1,
          relativePath: '2-B.pdf',
          reason: 'ConversionFailed',
        },
      ],
      warnings: [],
    });
  });

  it('identifies the planned PDF path when the converter returns invalid bytes', async () => {
    const generation = prepare('pdf');
    const converter = fakeConverter(async () => ({
      bytes: new TextEncoder().encode('invalid'),
      losses: [],
    }));

    const result = await generateArtifacts(generation, { pdfConverter: converter });

    expect(result).toMatchObject({
      ok: false,
      errors: [
        {
          code: 'PdfConversionFailed',
          documentId: 'document-0',
          recordIndex: 0,
          relativePath: '1-A.pdf',
          reason: 'InvalidPdfOutput',
        },
      ],
    });
  });

  it.each([
    [
      'MergeFailed',
      async () => {
        throw new Error('private merger detail');
      },
    ],
    ['InvalidPdfOutput', async () => new TextEncoder().encode('invalid')],
  ] as const)('identifies the merge target and %s reason', async (reason, merge) => {
    const generation = prepare('docx');
    const merger: PdfMerger = { merge };

    const result = await generateArtifacts(generation, {
      pdfConverter: fakeConverter(),
      pdfMerger: merger,
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: 'PdfMergeFailed',
          aggregateId: 'aggregate-0',
          relativePath: 'all.pdf',
          reason,
        },
      ],
      warnings: [],
    });
  });

  it('identifies a missing source PDF if an accepted plan is mutated', async () => {
    const generation = prepare('docx');
    const sourceIds = generation.plan.aggregates[0]!.sourceDocumentIds as string[];
    sourceIds[1] = 'missing-document';
    const merger: PdfMerger = {
      merge: async () => {
        throw new Error('merger must not run');
      },
    };

    const result = await generateArtifacts(generation, {
      pdfConverter: fakeConverter(),
      pdfMerger: merger,
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: 'PdfMergeFailed',
          aggregateId: 'aggregate-0',
          relativePath: 'all.pdf',
          reason: 'MissingSourcePdf',
          sourceDocumentId: 'missing-document',
        },
      ],
      warnings: [],
    });
  });
});

function prepare(documentOutputs: 'docx' | 'pdf'): Generation {
  const template = prepareTemplate(createDocx([['{name}']]));
  if (!template.ok) throw new Error(JSON.stringify(template.errors));
  const prepared = prepareGeneration({
    template: template.value,
    input: { kind: 'object-rows', rows: [{ name: 'A' }, { name: 'B' }] },
    request: {
      naming: {
        kind: 'template',
        pathTemplate: documentOutputs === 'pdf' ? '{$index}-{name}.pdf' : '{$index}-{name}.docx',
      },
      documentOutputs,
      aggregates: [{ kind: 'merged-pdf', relativePath: 'all.pdf' }],
    },
  });
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.errors));
  return prepared.value;
}

function fakeConverter(
  convert: PdfConverter['convert'] = async () => ({ bytes: pdf, losses: [] }),
): PdfConverter {
  return { id: 'test', getAvailability: async () => ({ available: true }), convert };
}
