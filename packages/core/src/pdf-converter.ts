export type PdfConversionLossSeverity = 'dropped' | 'degraded' | 'substituted';

export interface PdfConversionLoss {
  readonly severity: PdfConversionLossSeverity;
  readonly feature: string;
  readonly detail: string;
  readonly where?: string;
}

export type PdfConverterAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

export interface PdfConversionInput {
  readonly docx: Buffer;
  readonly sourceName: string;
}

export interface PdfConversionResult {
  readonly pdf: Buffer;
  readonly losses: readonly PdfConversionLoss[];
}

/** Converts one rendered DOCX without owning record rendering or output publication. */
export interface PdfConverter {
  readonly id: string;
  getAvailability(): Promise<PdfConverterAvailability>;
  convert(input: PdfConversionInput): Promise<PdfConversionResult>;
}
