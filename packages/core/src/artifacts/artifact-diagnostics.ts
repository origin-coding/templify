export type ArtifactPackagingError =
  | { readonly code: 'ArtifactSetMismatch'; readonly artifactId: string }
  | { readonly code: 'DuplicateGeneratedArtifact'; readonly artifactId: string }
  | { readonly code: 'ArchivePackagingFailed' };
