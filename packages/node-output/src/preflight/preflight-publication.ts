/* eslint-disable no-await-in-loop -- Preflight reports the first target in deterministic plan order. */
import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { StageResult } from '@templify/core';
import { comparisonKey } from '@/internal/path-safety.js';
import { systemErrorDetail } from '@/internal/system-error.js';
import type { PublicationPlan } from '@/plan/publication-plan.js';
import type { PublicationPreflightError } from './preflight-diagnostics.js';
import {
  createPreflightedPublication,
  type PreflightedPublication,
  type PreflightedPublicationItem,
} from './preflighted-publication.js';
import type { TargetSnapshot } from './target-snapshot.js';

export async function preflightPublication(
  plan: PublicationPlan,
): Promise<StageResult<PreflightedPublication, PublicationPreflightError>> {
  try {
    return await performPreflight(plan);
  } catch (cause) {
    return failure({
      code: 'OutputRootUnavailable',
      path: plan.rootDirectory,
      ...systemErrorDetail(cause),
    });
  }
}

async function performPreflight(
  plan: PublicationPlan,
): Promise<StageResult<PreflightedPublication, PublicationPreflightError>> {
  const rootIssue = await inspectRoot(plan.rootDirectory);
  if (rootIssue !== undefined) return failure(rootIssue);
  const protectedKeys = new Set(plan.protectedPaths.map(comparisonKey));
  const protectedTargets = await collectExistingProtectedTargets(plan.protectedPaths);
  const snapshots = new Map<string, TargetSnapshot>();
  const items: PreflightedPublicationItem[] = [];

  for (const item of plan.items) {
    const ancestorIssue = await inspectOutputAncestors(
      plan.rootDirectory,
      path.dirname(item.destinationPath),
    );
    if (ancestorIssue !== undefined) return failure(ancestorIssue);
    if (protectedKeys.has(comparisonKey(item.destinationPath))) {
      return failure({ code: 'OutputSameAsProtectedPath', path: item.destinationPath });
    }
    const inspected = await inspectTarget(item.destinationPath);
    if (!inspected.ok) return failure(inspected.error);
    if (inspected.snapshot.kind === 'file') {
      const targetRealPath = await realpath(item.destinationPath);
      if (
        protectedTargets.realPaths.has(comparisonKey(targetRealPath)) ||
        protectedTargets.identities.has(fileIdentity(inspected.snapshot))
      ) {
        return failure({ code: 'OutputSameAsProtectedPath', path: item.destinationPath });
      }
      if (plan.conflictPolicy === 'error')
        return failure({ code: 'OutputConflict', path: item.destinationPath });
    }
    snapshots.set(item.artifactId, inspected.snapshot);
    items.push({
      artifactId: item.artifactId,
      destinationPath: item.destinationPath,
      action: inspected.snapshot.kind === 'absent' ? 'create' : 'replace',
    });
  }
  return { ok: true, value: createPreflightedPublication(plan, items, snapshots), warnings: [] };
}

async function inspectRoot(root: string): Promise<PublicationPreflightError | undefined> {
  try {
    const info = await lstat(root);
    if (info.isSymbolicLink()) return { code: 'OutputPathUsesSymbolicLink', path: root };
    return info.isDirectory() ? undefined : { code: 'OutputRootNotDirectory', path: root };
  } catch (cause) {
    if (isMissing(cause)) {
      const parent = path.dirname(root);
      return parent === root ? { code: 'OutputRootUnavailable', path: root } : inspectRoot(parent);
    }
    return { code: 'OutputRootUnavailable', path: root, ...systemErrorDetail(cause) };
  }
}

async function inspectOutputAncestors(
  root: string,
  targetParent: string,
): Promise<PublicationPreflightError | undefined> {
  const relative = path.relative(root, targetParent);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) return { code: 'OutputPathUsesSymbolicLink', path: current };
      if (!info.isDirectory()) return { code: 'OutputPathAncestorNotDirectory', path: current };
    } catch (cause) {
      if (isMissing(cause)) return undefined;
      throw cause;
    }
  }
  return undefined;
}

async function inspectTarget(
  pathname: string,
): Promise<
  | { readonly ok: true; readonly snapshot: TargetSnapshot }
  | { readonly ok: false; readonly error: PublicationPreflightError }
> {
  try {
    const info = await lstat(pathname);
    if (info.isSymbolicLink())
      return { ok: false, error: { code: 'OutputPathUsesSymbolicLink', path: pathname } };
    if (info.isDirectory())
      return { ok: false, error: { code: 'OutputTargetIsDirectory', path: pathname } };
    if (!info.isFile())
      return { ok: false, error: { code: 'OutputTargetUnsupported', path: pathname } };
    return {
      ok: true,
      snapshot: {
        kind: 'file',
        size: info.size,
        mtimeMs: info.mtimeMs,
        device: info.dev,
        inode: info.ino,
      },
    };
  } catch (cause) {
    if (isMissing(cause)) return { ok: true, snapshot: { kind: 'absent' } };
    return {
      ok: false,
      error: { code: 'OutputRootUnavailable', path: pathname, ...systemErrorDetail(cause) },
    };
  }
}

async function collectExistingProtectedTargets(paths: readonly string[]): Promise<{
  readonly realPaths: ReadonlySet<string>;
  readonly identities: ReadonlySet<string>;
}> {
  const realPaths = new Set<string>();
  const identities = new Set<string>();
  for (const pathname of paths) {
    try {
      realPaths.add(comparisonKey(await realpath(pathname)));
      const info = await stat(pathname);
      if (info.isFile()) identities.add(`${info.dev}:${info.ino}`);
    } catch (cause) {
      if (!isMissing(cause)) throw cause;
    }
  }
  return { realPaths, identities };
}

function fileIdentity(snapshot: Extract<TargetSnapshot, { readonly kind: 'file' }>): string {
  return `${snapshot.device}:${snapshot.inode}`;
}

function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
}
function failure(error: PublicationPreflightError): StageResult<never, PublicationPreflightError> {
  return { ok: false, errors: [error], warnings: [] };
}
