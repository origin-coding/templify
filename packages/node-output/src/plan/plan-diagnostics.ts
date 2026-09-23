export type PublicationPlanError =
  | { readonly code: 'InvalidOutputRoot'; readonly reason: 'NotAbsolute' }
  | { readonly code: 'UnsafeOutputPath'; readonly relativePath: string }
  | { readonly code: 'DuplicateOutputPath'; readonly relativePath: string };
