import { Ream, type ReamConvertOptions } from 'reamkit';

import type {
  PdfConversionInput,
  PdfConversionLoss,
  PdfConversionResult,
  PdfConverter,
  PdfConverterAvailability,
} from './pdf-converter.js';

export interface ReamKitPdfConverterOptions {
  readonly convertOptions?: ReamConvertOptions;
}

/** In-process DOCX-to-PDF conversion backed by ReamKit. */
export class ReamKitPdfConverter implements PdfConverter {
  readonly id = 'reamkit';
  readonly #convertOptions: ReamConvertOptions;

  constructor(options: ReamKitPdfConverterOptions = {}) {
    this.#convertOptions = options.convertOptions ?? {};
  }

  async getAvailability(): Promise<PdfConverterAvailability> {
    return { available: true };
  }

  async convert(input: PdfConversionInput): Promise<PdfConversionResult> {
    const document = Ream.parse(input.docx);
    if (document.format !== 'docx') {
      throw new Error(`Expected a DOCX source but ReamKit detected "${document.format}".`);
    }

    const result = await document.convertWithReport('pdf', this.#convertOptions);
    return {
      pdf: Buffer.from(result.bytes),
      losses: result.losses.map(mapLoss),
    };
  }
}

function mapLoss(loss: {
  readonly severity: PdfConversionLoss['severity'];
  readonly feature: string;
  readonly detail: string;
  readonly where?: string;
}): PdfConversionLoss {
  return {
    severity: loss.severity,
    feature: loss.feature,
    detail: loss.detail,
    ...(loss.where === undefined ? {} : { where: loss.where }),
  };
}
