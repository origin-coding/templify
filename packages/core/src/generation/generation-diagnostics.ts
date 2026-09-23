export type ArtifactPathErrorReason =
  | 'EmptyPath'
  | 'AbsolutePath'
  | 'EmptySegment'
  | 'DotSegment'
  | 'InvalidCharacter'
  | 'TrailingDotOrSpace'
  | 'ReservedDeviceName'
  | 'FilenameTooLong'
  | 'UnsupportedExtension';

export type GenerationPlanError =
  | { readonly code: 'InvalidRecordCount'; readonly expected: 'one' | 'one-or-more' }
  | { readonly code: 'InvalidNamingTemplate'; readonly reason: string }
  | { readonly code: 'UnknownNamingField'; readonly fieldName: string }
  | { readonly code: 'CollectionNamingField'; readonly fieldName: string }
  | {
      readonly code: 'MissingNamingValue' | 'NullNamingValue' | 'EmptyNamingValue';
      readonly recordIndex: number;
      readonly fieldName: string;
    }
  | {
      readonly code: 'InvalidNamingValue';
      readonly recordIndex: number;
      readonly fieldName: string;
    }
  | {
      readonly code: 'InvalidArtifactPath';
      readonly path: string;
      readonly reason: ArtifactPathErrorReason;
      readonly recordIndex?: number;
    }
  | {
      readonly code: 'DuplicateArtifactPath';
      readonly path: string;
      readonly firstId: string;
      readonly secondId: string;
    }
  | { readonly code: 'DuplicateAggregateId'; readonly aggregateId: string };

export interface NamingValueSanitizedWarning {
  readonly code: 'NamingValueSanitized';
  readonly recordIndex: number;
  readonly fieldName: string;
  readonly resultingPath: string;
}

export type GenerationPlanWarning = NamingValueSanitizedWarning;

export type InvalidGenerationError =
  | { readonly code: 'InvalidGeneration'; readonly reason: 'RecordCountMismatch' }
  | { readonly code: 'InvalidGeneration'; readonly reason: 'InvalidDocumentReference' }
  | { readonly code: 'InvalidGeneration'; readonly reason: 'DuplicateDocumentId' }
  | { readonly code: 'InvalidGeneration'; readonly reason: 'InvalidAggregateReference' }
  | { readonly code: 'InvalidGeneration'; readonly reason: 'InvalidPreparedTemplate' };

export type GenerationError =
  | InvalidGenerationError
  | {
      readonly code: 'DocumentRenderFailed';
      readonly documentId: string;
      readonly recordIndex: number;
      readonly detail: import('../rendering/rendering-diagnostics').DocumentRenderError;
    }
  | {
      readonly code: 'PdfConverterUnavailable';
      readonly converterId: string;
      readonly reason: string;
    }
  | {
      readonly code: 'PdfConversionFailed';
      readonly converterId: string;
      readonly documentId: string;
      readonly recordIndex: number;
      readonly reason: 'ConversionFailed' | 'InvalidPdfOutput';
    }
  | { readonly code: 'PdfMergeFailed'; readonly aggregateId: string };

export interface PdfConversionLossWarning {
  readonly code: 'PdfConversionLoss';
  readonly documentId: string;
  readonly recordIndex: number;
  readonly converterId: string;
  readonly severity: 'dropped' | 'degraded' | 'substituted';
  readonly feature: string;
  readonly detail: string;
  readonly where?: string;
}

export type GenerationWarning = PdfConversionLossWarning;
