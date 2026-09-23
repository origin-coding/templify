/* eslint-disable no-await-in-loop -- Generation is deliberately ordered and fail-fast. */
import type { GeneratedArtifact, GeneratedArtifactSet } from '@/artifacts/generated-artifact';
import type { PdfConverter } from '@/pdf/pdf-converter';
import type { PdfMerger } from '@/pdf/pdf-merger';
import { cantooPdfMerger } from '@/pdf/cantoo-pdf-merger';
import { reamkitPdfConverter } from '@/pdf/reamkit-pdf-converter';
import { DocumentRenderFailure, renderDocument } from '@/rendering/render-document';
import type { StageResult } from '@/stage-result';
import type { GenerationError, GenerationWarning } from './generation-diagnostics';
import { getGenerationFormatter, type Generation } from './generation';

export interface GenerationDependencies {
  readonly pdfConverter?: PdfConverter;
  readonly pdfMerger?: PdfMerger;
}

export async function generateArtifacts(
  generation: Generation,
  dependencies: GenerationDependencies = {},
): Promise<StageResult<GeneratedArtifactSet, GenerationError, GenerationWarning>> {
  let formatter;
  try {
    formatter = getGenerationFormatter(generation);
  } catch {
    return failure({ code: 'InvalidGeneration', reason: 'InvalidPreparedTemplate' });
  }
  const artifacts: GeneratedArtifact[] = [];
  const warnings: GenerationWarning[] = [];
  const pdfByDocument = new Map<string, Uint8Array>();
  const needsPdf =
    generation.plan.documentOutputs !== 'docx' || generation.plan.aggregates.length > 0;
  const converter = dependencies.pdfConverter ?? reamkitPdfConverter;

  if (needsPdf) {
    try {
      const availability = await converter.getAvailability();
      if (!availability.available) {
        return failure({
          code: 'PdfConverterUnavailable',
          converterId: converter.id,
          reason: availability.reason,
        });
      }
    } catch {
      return failure({
        code: 'PdfConverterUnavailable',
        converterId: converter.id,
        reason: 'AvailabilityCheckFailed',
      });
    }
  }

  for (const document of generation.plan.documents) {
    let docx: Uint8Array;
    try {
      docx = renderDocument(
        generation.template,
        generation.batch.records[document.recordIndex]!,
        generation.renderOptions,
        formatter,
      );
    } catch (cause) {
      return failure(
        {
          code: 'DocumentRenderFailed',
          documentId: document.documentId,
          recordIndex: document.recordIndex,
          detail: cause instanceof DocumentRenderFailure ? cause.issue : { code: 'RenderFailed' },
        },
        warnings,
      );
    }
    if (generation.plan.documentOutputs !== 'pdf') {
      artifacts.push({
        artifactId: `${document.documentId}:docx`,
        kind: 'docx',
        relativePath: document.docxPath,
        bytes: docx,
      });
    }
    if (needsPdf) {
      let converted;
      try {
        converted = await converter.convert(docx);
      } catch {
        return failure(
          {
            code: 'PdfConversionFailed',
            converterId: converter.id,
            documentId: document.documentId,
            recordIndex: document.recordIndex,
            reason: 'ConversionFailed',
          },
          warnings,
        );
      }
      if (!isPdf(converted.bytes)) {
        return failure(
          {
            code: 'PdfConversionFailed',
            converterId: converter.id,
            documentId: document.documentId,
            recordIndex: document.recordIndex,
            reason: 'InvalidPdfOutput',
          },
          warnings,
        );
      }
      pdfByDocument.set(document.documentId, converted.bytes);
      for (const loss of converted.losses)
        warnings.push({
          code: 'PdfConversionLoss',
          documentId: document.documentId,
          recordIndex: document.recordIndex,
          converterId: converter.id,
          ...loss,
        });
      if (generation.plan.documentOutputs !== 'docx') {
        artifacts.push({
          artifactId: `${document.documentId}:pdf`,
          kind: 'pdf',
          relativePath: replaceExtension(document.docxPath, '.pdf'),
          bytes: converted.bytes,
        });
      }
    }
  }

  for (const aggregate of generation.plan.aggregates) {
    const merger = dependencies.pdfMerger ?? cantooPdfMerger;
    const sources = aggregate.sourceDocumentIds.map((id) => pdfByDocument.get(id));
    if (sources.some((source) => source === undefined)) {
      return failure({ code: 'PdfMergeFailed', aggregateId: aggregate.aggregateId }, warnings);
    }
    let merged: Uint8Array;
    try {
      merged = await merger.merge(sources as Uint8Array[]);
    } catch {
      return failure({ code: 'PdfMergeFailed', aggregateId: aggregate.aggregateId }, warnings);
    }
    if (!isPdf(merged))
      return failure({ code: 'PdfMergeFailed', aggregateId: aggregate.aggregateId }, warnings);
    artifacts.push({
      artifactId: `${aggregate.aggregateId}:pdf`,
      kind: 'merged-pdf',
      relativePath: aggregate.relativePath,
      bytes: merged,
    });
  }
  return { ok: true, value: { artifacts }, warnings };
}

function failure(
  error: GenerationError,
  warnings: readonly GenerationWarning[] = [],
): StageResult<never, GenerationError, GenerationWarning> {
  return { ok: false, errors: [error], warnings };
}
function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && new TextDecoder('ascii').decode(bytes.slice(0, 5)) === '%PDF-';
}
function replaceExtension(path: string, extension: string): string {
  return `${path.slice(0, path.lastIndexOf('.'))}${extension}`;
}
