export interface PublishedArtifact {
  readonly artifactId: string;
  readonly path: string;
  readonly replacedExisting: boolean;
}

export interface PublicationResult {
  readonly artifacts: readonly PublishedArtifact[];
}
