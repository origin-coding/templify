import type { BundleStrategy, DocumentOutputSelection } from './generation-request.js';

export interface DocumentPlanItem {
  readonly documentId: string;
  /** Zero-based index into NormalizedRecordBatch.records. */
  readonly recordIndex: number;
  /** Canonical safe relative DOCX path using forward slashes. */
  readonly docxPath: string;
}

export interface MergedPdfPlanItem {
  readonly kind: 'merged-pdf';
  readonly aggregateId: string;
  readonly relativePath: string;
  readonly sourceDocumentIds: readonly string[];
}

export type AggregatePlanItem = MergedPdfPlanItem;

export interface GenerationPlan {
  readonly version: 1;
  readonly documentOutputs: DocumentOutputSelection;
  readonly documents: readonly DocumentPlanItem[];
  readonly aggregates: readonly AggregatePlanItem[];
  readonly bundle: BundleStrategy;
}
