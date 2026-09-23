export interface RecordOrigin {
  /** Zero-based position in RawInputBatch. */
  readonly inputRowIndex: number;
  /** One-based row number suitable for display when the source exposes one. */
  readonly sourceRowNumber?: number;
  readonly sheetName?: string;
}

export interface InputRowOrigin {
  readonly sourceRowNumber?: number;
  readonly sheetName?: string;
}
