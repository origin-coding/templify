import type { DocxOutputPlanItem } from './plan-docx-output.js';

export type PdfGenerationErrorCode =
  | 'InvalidPdfGenerationPlan'
  | 'PdfConverterUnavailable'
  | 'PdfConversionFailed';

export type PdfConversionFailureReason = 'ConversionFailed' | 'InvalidPdfOutput';

export class InvalidPdfGenerationPlanError extends Error {
  readonly code = 'InvalidPdfGenerationPlan' as const;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class PdfConverterUnavailableError extends Error {
  readonly code = 'PdfConverterUnavailable' as const;
  readonly converterId: string;
  readonly reason: string;

  constructor(converterId: string, reason: string, options: ErrorOptions = {}) {
    super(`PDF converter "${converterId}" is unavailable: ${reason}`, options);
    this.name = new.target.name;
    this.converterId = converterId;
    this.reason = reason;
  }
}

export class PdfConversionFailedError extends Error {
  readonly code = 'PdfConversionFailed' as const;
  readonly converterId: string;
  readonly item: DocxOutputPlanItem;
  readonly reason: PdfConversionFailureReason;

  constructor(
    converterId: string,
    item: DocxOutputPlanItem,
    reason: PdfConversionFailureReason,
    cause: unknown,
  ) {
    super(`PDF conversion failed for planned record ${item.recordIndex + 1}.`, { cause });
    this.name = new.target.name;
    this.converterId = converterId;
    this.item = item;
    this.reason = reason;
  }
}
