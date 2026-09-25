import path from 'node:path';
import type { StageResult } from '@templify/core';
import { createPublicationPlan } from '@/plan';
import type { PublicationPlanError } from '@/plan';
import { preflightPublication } from '@/preflight';
import type { PublicationPreflightError } from '@/preflight';
import { publishArtifacts } from '@/publish';
import type { PublishError, PublishWarning } from '@/publish';
import type { PublicationResult } from '@/publish';
import type { ConflictPolicy } from '@/plan';

export interface PublishStandaloneFileInput {
  readonly outputPath: string;
  readonly bytes: Uint8Array;
  readonly conflictPolicy?: ConflictPolicy;
  readonly protectedPaths?: readonly string[];
}

export type PublishStandaloneFileError =
  | PublicationPlanError
  | PublicationPreflightError
  | PublishError;

export async function publishStandaloneFile(
  input: PublishStandaloneFileInput,
): Promise<StageResult<PublicationResult, PublishStandaloneFileError, PublishWarning>> {
  const relativePath = path.basename(input.outputPath);
  const artifactId = 'standalone:file';
  const manifest = {
    version: 1 as const,
    items: [{ artifactId, kind: 'file' as const, relativePath }],
  };
  const planned = createPublicationPlan({
    manifest,
    rootDirectory: path.dirname(input.outputPath),
    ...(input.conflictPolicy === undefined ? {} : { conflictPolicy: input.conflictPolicy }),
    ...(input.protectedPaths === undefined ? {} : { protectedPaths: input.protectedPaths }),
  });
  if (!planned.ok) return planned;
  const preflighted = await preflightPublication(planned.value);
  if (!preflighted.ok) return preflighted;
  return publishArtifacts(preflighted.value, {
    artifacts: [{ artifactId, kind: 'file', relativePath, bytes: input.bytes }],
  });
}
