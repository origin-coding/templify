import path from 'node:path';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  BatchRenderFailedError,
  InvalidPdfGenerationPlanError,
  PdfConversionFailedError,
  PdfConverterUnavailableError,
  ReamKitPdfConverter,
  createDocxOutputPlan,
  generatePdfDocuments,
  inspectTemplate,
  type DocxOutputPlan,
  type PdfConverter,
  type RecordData,
} from '../src/index.js';
import { createDocx } from './docx-fixture.js';

describe('generatePdfDocuments', () => {
  const template = createDocx([['Name: {name}']]);

  it('renders and converts records sequentially in accepted plan order', async () => {
    const records = [{ name: 'Alice' }, { name: 'Bob' }];
    const plan = directoryPlan(records, 'forms/{$index}-{name}.docx');
    const convertedNames: string[] = [];
    const converter = fakeConverter(async ({ docx, sourceName }) => {
      convertedNames.push(sourceName);
      return {
        pdf: pdfBytes(readDocumentXml(docx)),
        losses: [
          {
            severity: 'substituted',
            feature: 'fonts.substitution',
            detail: `Substituted for ${sourceName}`,
          },
        ],
      };
    });

    const result = await generatePdfDocuments({ template, records, plan, converter });

    expect(convertedNames).toEqual(['forms/1-Alice.docx', 'forms/2-Bob.docx']);
    expect(result).toMatchObject({
      converterId: 'fake',
      documents: [
        {
          item: plan.items[0],
          relativePath: 'forms/1-Alice.pdf',
          losses: [{ severity: 'substituted', feature: 'fonts.substitution' }],
        },
        {
          item: plan.items[1],
          relativePath: 'forms/2-Bob.pdf',
          losses: [{ severity: 'substituted', feature: 'fonts.substitution' }],
        },
      ],
    });
    expect(result.documents[0]!.pdf.toString()).toContain('Name: Alice');
    expect(result.documents[1]!.pdf.toString()).toContain('Name: Bob');
  });

  it('derives a single PDF name from the caller-selected DOCX name', async () => {
    const records = [{ name: 'Alice' }];
    const plan = singlePlan(records, 'Selected Name.docx');

    const result = await generatePdfDocuments({
      template,
      records,
      plan,
      converter: fakeConverter(),
    });

    expect(result.documents).toMatchObject([
      { relativePath: 'Selected Name.pdf', item: plan.items[0] },
    ]);
  });

  it('checks converter availability before rendering', async () => {
    const records = [{ name: 'Alice' }];
    const plan = singlePlan(records, 'Alice.docx');
    const converter = fakeConverter();
    converter.getAvailability = async () => ({
      available: false,
      reason: 'required runtime assets are missing',
    });

    const operation = generatePdfDocuments({
      template: Buffer.from('not a DOCX'),
      records,
      plan,
      converter,
    });

    await expect(operation).rejects.toBeInstanceOf(PdfConverterUnavailableError);
    await expect(operation).rejects.toMatchObject({
      code: 'PdfConverterUnavailable',
      converterId: 'fake',
      reason: 'required runtime assets are missing',
    });
  });

  it('attaches the accepted plan item when conversion fails', async () => {
    const records = [{ name: 'Alice' }, { name: 'Bob' }];
    const plan = directoryPlan(records, '{$index}.docx');
    let call = 0;
    const converter = fakeConverter(async () => {
      call += 1;
      if (call === 2) throw new Error('converter failed');
      return { pdf: pdfBytes('first'), losses: [] };
    });

    const operation = generatePdfDocuments({ template, records, plan, converter });

    await expect(operation).rejects.toBeInstanceOf(PdfConversionFailedError);
    await expect(operation).rejects.toMatchObject({
      code: 'PdfConversionFailed',
      converterId: 'fake',
      item: { recordIndex: 1, relativePath: '2.docx' },
      reason: 'ConversionFailed',
    });
  });

  it('rejects converter output that is not a PDF', async () => {
    const records = [{ name: 'Alice' }];
    const plan = singlePlan(records, 'Alice.docx');
    const converter = fakeConverter(async () => ({ pdf: Buffer.from('invalid'), losses: [] }));

    await expect(
      generatePdfDocuments({ template, records, plan, converter }),
    ).rejects.toMatchObject({
      code: 'PdfConversionFailed',
      item: { recordIndex: 0 },
      reason: 'InvalidPdfOutput',
    });
  });

  it('reports DOCX rendering failures before converting any record', async () => {
    const records = [{ name: 'Alice' }, {}];
    const plan = directoryPlan(records, '{$index}.docx');
    let conversionCount = 0;
    const converter = fakeConverter(async () => {
      conversionCount += 1;
      return { pdf: pdfBytes('unused'), losses: [] };
    });

    const operation = generatePdfDocuments({ template, records, plan, converter });

    await expect(operation).rejects.toBeInstanceOf(BatchRenderFailedError);
    await expect(operation).rejects.toMatchObject({ item: { recordIndex: 1 } });
    expect(conversionCount).toBe(0);
  });

  it('rejects a tampered plan that no longer preserves record order', async () => {
    const records = [{ name: 'Alice' }, { name: 'Bob' }];
    const original = directoryPlan(records, '{$index}.docx');
    const plan: DocxOutputPlan = {
      ...original,
      items: [original.items[1]!, original.items[0]!],
    };

    await expect(
      generatePdfDocuments({ template, records, plan, converter: fakeConverter() }),
    ).rejects.toBeInstanceOf(InvalidPdfGenerationPlanError);
  });

  it('converts a real empty DOCX with ReamKit without publishing an intermediate file', async () => {
    const emptyTemplate = createDocx([[]]);
    const records = [{}];
    const plan = createPlan(records, emptyTemplate, {
      mode: 'single-document',
      rootDirectory: path.resolve('output'),
      fileName: 'empty.docx',
    });

    const result = await generatePdfDocuments({
      template: emptyTemplate,
      records,
      plan,
      converter: new ReamKitPdfConverter(),
    });

    expect(result.converterId).toBe('reamkit');
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.relativePath).toBe('empty.pdf');
    expect(result.documents[0]!.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 15_000);

  function directoryPlan(records: readonly RecordData[], pathTemplate: string): DocxOutputPlan {
    return createPlan(records, template, {
      mode: 'directory',
      rootDirectory: path.resolve('output'),
      pathTemplate,
    });
  }

  function singlePlan(records: readonly RecordData[], fileName: string): DocxOutputPlan {
    return createPlan(records, template, {
      mode: 'single-document',
      rootDirectory: path.resolve('output'),
      fileName,
    });
  }
});

function createPlan(
  records: readonly RecordData[],
  template: Buffer,
  target:
    | {
        readonly mode: 'single-document';
        readonly rootDirectory: string;
        readonly fileName: string;
      }
    | { readonly mode: 'directory'; readonly rootDirectory: string; readonly pathTemplate: string },
): DocxOutputPlan {
  const result = createDocxOutputPlan({
    records,
    fields: inspectTemplate(template),
    target,
  });
  if (!result.ok) throw new Error(`Expected a valid plan: ${JSON.stringify(result.errors)}`);
  return result.plan;
}

function fakeConverter(
  convert: PdfConverter['convert'] = async () => ({ pdf: pdfBytes('converted'), losses: [] }),
): PdfConverter {
  return {
    id: 'fake',
    getAvailability: async () => ({ available: true }),
    convert,
  };
}

function pdfBytes(content: string): Buffer {
  return Buffer.from(`%PDF-1.7\n${content}`);
}

function readDocumentXml(document: Buffer): string {
  return new PizZip(document).file('word/document.xml')?.asText() ?? '';
}
