import type { PublicationManifest, PublicationManifestItem } from '@templify/core';

export type ConflictPolicy = 'error' | 'overwrite';

export interface PublicationPlanItem extends PublicationManifestItem {
  readonly destinationPath: string;
}

export interface PublicationPlan {
  readonly version: 1;
  readonly rootDirectory: string;
  readonly conflictPolicy: ConflictPolicy;
  readonly manifest: PublicationManifest;
  readonly items: readonly PublicationPlanItem[];
  readonly protectedPaths: readonly string[];
}
