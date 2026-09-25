export type PublishableArtifactKind = 'docx' | 'pdf' | 'merged-pdf' | 'zip' | 'file';

export interface PublishableArtifact {
  readonly artifactId: string;
  readonly kind: PublishableArtifactKind;
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export interface PublishableArtifactSet {
  readonly artifacts: readonly PublishableArtifact[];
}
