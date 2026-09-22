export type GenerationNaming =
  | { readonly kind: 'single'; readonly fileName: string }
  | { readonly kind: 'template'; readonly pathTemplate: string };

export type DocumentOutputSelection = 'docx' | 'pdf' | 'docx-and-pdf';

export interface MergedPdfRequest {
  readonly kind: 'merged-pdf';
  readonly relativePath: string;
}

export type AggregateRequest = MergedPdfRequest;

export type BundleStrategy =
  | { readonly kind: 'individual-files' }
  | { readonly kind: 'zip'; readonly fileName: string };

export interface GenerationRequest {
  readonly naming: GenerationNaming;
  readonly documentOutputs: DocumentOutputSelection;
  readonly aggregates?: readonly AggregateRequest[];
  readonly bundle?: BundleStrategy;
}
