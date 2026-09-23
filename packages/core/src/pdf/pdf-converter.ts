export interface PdfConversionLoss {
  readonly severity: 'dropped' | 'degraded' | 'substituted';
  readonly feature: string;
  readonly detail: string;
  readonly where?: string;
}

export interface PdfConversionResult {
  readonly bytes: Uint8Array;
  readonly losses: readonly PdfConversionLoss[];
}

export type PdfConverterAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

export interface PdfConverter {
  readonly id: string;
  getAvailability(): Promise<PdfConverterAvailability>;
  convert(docx: Uint8Array): Promise<PdfConversionResult>;
}
