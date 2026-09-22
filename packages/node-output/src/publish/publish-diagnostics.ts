import type { SystemErrorDetail } from '@/internal/system-error.js';

export type PublishError =
  | { readonly code: 'InvalidPreflight' }
  | { readonly code: 'ArtifactSetMismatch'; readonly artifactId: string }
  | { readonly code: 'OutputChangedAfterPreflight'; readonly path: string }
  | ({
      readonly code: 'OutputWriteFailed';
      readonly path: string;
      readonly phase: 'prepare' | 'replace' | 'cleanup';
    } & SystemErrorDetail);

export interface PublishCleanupWarning extends SystemErrorDetail {
  readonly code: 'TemporaryFileCleanupFailed' | 'BackupCleanupFailed' | 'RollbackFailed';
  readonly path: string;
}

export type PublishWarning = PublishCleanupWarning;
