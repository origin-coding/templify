export interface PdfMerger {
  merge(documents: readonly Uint8Array[]): Promise<Uint8Array>;
}
