import { renderPlannedDocuments } from './multi-document-generation.js';
import type { PdfConversionLoss, PdfConverter } from './pdf-converter.js';
import {
  InvalidPdfGenerationPlanError,
  PdfConversionFailedError,
  PdfConverterUnavailableError,
} from './pdf-generation-errors.js';
import type { DocxOutputPlan, DocxOutputPlanItem } from './plan-docx-output.js';
import { ReamKitPdfConverter } from './reamkit-pdf-converter.js';
import type { RecordData } from './record-data.js';
import type { RenderOptions } from './render-options.js';

export interface GeneratePdfDocumentsInput {
  readonly template: Buffer;
  readonly records: readonly RecordData[];
  readonly plan: DocxOutputPlan;
  readonly renderOptions?: RenderOptions;
  readonly converter?: PdfConverter;
}

export interface GeneratedPdfDocument {
  readonly item: DocxOutputPlanItem;
  /** The planned DOCX path with only its terminal extension changed to .pdf. */
  readonly relativePath: string;
  readonly pdf: Buffer;
  readonly losses: readonly PdfConversionLoss[];
}

export interface GeneratePdfDocumentsResult {
  readonly converterId: string;
  readonly documents: readonly GeneratedPdfDocument[];
}

/**
 * Renders and converts every accepted plan item in memory without publishing
 * either the intermediate DOCX documents or the resulting PDF documents.
 */
export async function generatePdfDocuments(
  input: GeneratePdfDocumentsInput,
): Promise<GeneratePdfDocumentsResult> {
  validatePlan(input.plan, input.records.length);

  const converter = input.converter ?? new ReamKitPdfConverter();
  await ensureConverterAvailable(converter);

  const renderedDocuments = renderPlannedDocuments(
    input.template,
    input.records,
    input.plan.items,
    input.renderOptions,
  );
  const documents: GeneratedPdfDocument[] = [];

  // Convert sequentially because some converter implementations own a single process or session.
  for (const rendered of renderedDocuments) {
    let converted;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- converters may own one process/session.
      converted = await converter.convert({
        docx: rendered.buffer,
        sourceName: rendered.item.relativePath,
      });
    } catch (cause) {
      throw new PdfConversionFailedError(converter.id, rendered.item, 'ConversionFailed', cause);
    }

    if (!isPdf(converted.pdf)) {
      throw new PdfConversionFailedError(
        converter.id,
        rendered.item,
        'InvalidPdfOutput',
        new Error('The converter returned data without a PDF header.'),
      );
    }

    documents.push({
      item: rendered.item,
      relativePath: toPdfPath(rendered.item.relativePath),
      pdf: converted.pdf,
      losses: [...converted.losses],
    });
  }

  return { converterId: converter.id, documents };
}

async function ensureConverterAvailable(converter: PdfConverter): Promise<void> {
  let availability;
  try {
    availability = await converter.getAvailability();
  } catch (cause) {
    throw new PdfConverterUnavailableError(converter.id, 'the availability check failed', {
      cause,
    });
  }

  if (!availability.available) {
    throw new PdfConverterUnavailableError(converter.id, availability.reason);
  }
}

function validatePlan(plan: DocxOutputPlan, recordCount: number): void {
  if (recordCount === 0 || plan.items.length !== recordCount) {
    throw new InvalidPdfGenerationPlanError(
      'PDF generation requires exactly one accepted plan item for every record.',
    );
  }

  const pdfPaths = new Set<string>();
  for (const [position, item] of plan.items.entries()) {
    if (item.recordIndex !== position) {
      throw new InvalidPdfGenerationPlanError(
        'PDF generation plan items must preserve record order.',
      );
    }

    const relativePath = toPdfPath(item.relativePath);
    const comparisonKey = relativePath.toLocaleLowerCase('en-US');
    if (pdfPaths.has(comparisonKey)) {
      throw new InvalidPdfGenerationPlanError(
        'PDF generation plan items must produce unique PDF paths.',
      );
    }
    pdfPaths.add(comparisonKey);
  }
}

function toPdfPath(relativePath: string): string {
  if (!/\.docx$/iu.test(relativePath)) {
    throw new InvalidPdfGenerationPlanError(
      'Every PDF generation plan item must use the .docx extension.',
    );
  }
  return relativePath.replace(/\.docx$/iu, '.pdf');
}

function isPdf(value: Buffer): boolean {
  return value.byteLength >= 5 && value.subarray(0, 5).toString('ascii') === '%PDF-';
}
