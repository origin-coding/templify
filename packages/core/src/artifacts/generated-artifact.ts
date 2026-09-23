export type GeneratedArtifactKind = 'docx' | 'pdf' | 'merged-pdf';

export interface GeneratedArtifact {
  readonly artifactId: string;
  readonly kind: GeneratedArtifactKind;
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export interface GeneratedArtifactSet {
  readonly artifacts: readonly GeneratedArtifact[];
}
