import type { SystemErrorDetail } from '@/internal/system-error';

export type PublicationPreflightError =
  | ({ readonly code: 'OutputRootUnavailable'; readonly path: string } & SystemErrorDetail)
  | { readonly code: 'OutputRootNotDirectory'; readonly path: string }
  | { readonly code: 'OutputPathUsesSymbolicLink'; readonly path: string }
  | { readonly code: 'OutputPathAncestorNotDirectory'; readonly path: string }
  | { readonly code: 'OutputTargetIsDirectory'; readonly path: string }
  | { readonly code: 'OutputTargetUnsupported'; readonly path: string }
  | { readonly code: 'OutputConflict'; readonly path: string }
  | { readonly code: 'OutputSameAsProtectedPath'; readonly path: string };
