import path from 'node:path';
import type { PublicationManifest } from '@templify/core';
import type { StageResult } from '@templify/core';
import { comparisonKey, resolveInsideRoot } from '@/internal/path-safety';
import type { PublicationPlanError } from './plan-diagnostics';
import type { ConflictPolicy, PublicationPlan, PublicationPlanItem } from './publication-plan';

export interface CreatePublicationPlanInput {
  readonly manifest: PublicationManifest;
  readonly rootDirectory: string;
  readonly conflictPolicy?: ConflictPolicy;
  readonly protectedPaths?: readonly string[];
}

export function createPublicationPlan(
  input: CreatePublicationPlanInput,
): StageResult<PublicationPlan, PublicationPlanError> {
  if (!path.isAbsolute(input.rootDirectory)) {
    return failure({ code: 'InvalidOutputRoot', reason: 'NotAbsolute' });
  }
  const rootDirectory = path.resolve(input.rootDirectory);
  const items: PublicationPlanItem[] = [];
  const paths = new Set<string>();
  for (const item of input.manifest.items) {
    const destinationPath = resolveInsideRoot(rootDirectory, item.relativePath);
    if (destinationPath === undefined)
      return failure({ code: 'UnsafeOutputPath', relativePath: item.relativePath });
    const key = comparisonKey(destinationPath);
    if (paths.has(key))
      return failure({ code: 'DuplicateOutputPath', relativePath: item.relativePath });
    paths.add(key);
    items.push(Object.freeze({ ...item, destinationPath }));
  }
  const manifest = Object.freeze({
    version: 1 as const,
    items: Object.freeze(input.manifest.items.map((item) => Object.freeze({ ...item }))),
  });
  return {
    ok: true,
    value: Object.freeze({
      version: 1,
      rootDirectory,
      conflictPolicy: input.conflictPolicy ?? 'error',
      manifest,
      items: Object.freeze(items),
      protectedPaths: Object.freeze(
        (input.protectedPaths ?? []).map((value) => path.resolve(value)),
      ),
    }),
    warnings: [],
  };
}

function failure(error: PublicationPlanError): StageResult<never, PublicationPlanError> {
  return { ok: false, errors: [error], warnings: [] };
}
