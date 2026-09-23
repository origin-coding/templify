/* eslint-disable no-await-in-loop -- Publication ordering and rollback state are intentionally sequential. */
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { PublishableArtifactSet, StageResult } from '@templify/core';
import { systemErrorDetail } from '@/internal/system-error';
import {
  getPreflightSnapshots,
  type PreflightedPublication,
} from '@/preflight/preflighted-publication';
import { snapshotsEqual, type TargetSnapshot } from '@/preflight/target-snapshot';
import { cleanupBackups, rollbackPublication } from './cleanup-publication';
import type { PublishError, PublishWarning } from './publish-diagnostics';
import type { PublicationResult, PublishedArtifact } from './publication-result';
import {
  ReplacementFailure,
  replaceOutputFile,
  type ReplacementState,
} from './replace-output-file';

interface PreparedFile {
  readonly artifactId: string;
  readonly temporaryPath: string;
  readonly destinationPath: string;
  readonly replaceExisting: boolean;
}

export async function publishArtifacts(
  preflighted: PreflightedPublication,
  artifacts: PublishableArtifactSet,
): Promise<StageResult<PublicationResult, PublishError, PublishWarning>> {
  let snapshots: ReadonlyMap<string, TargetSnapshot>;
  try {
    snapshots = getPreflightSnapshots(preflighted);
  } catch {
    return failure({ code: 'InvalidPreflight' });
  }
  const byId = new Map(artifacts.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  if (byId.size !== artifacts.artifacts.length || byId.size !== preflighted.plan.items.length) {
    return failure({ code: 'ArtifactSetMismatch', artifactId: '<set>' });
  }
  for (const item of preflighted.plan.items) {
    const artifact = byId.get(item.artifactId);
    if (
      artifact === undefined ||
      artifact.kind !== item.kind ||
      artifact.relativePath !== item.relativePath
    ) {
      return failure({ code: 'ArtifactSetMismatch', artifactId: item.artifactId });
    }
    let current: TargetSnapshot;
    try {
      current = await snapshot(item.destinationPath);
    } catch (cause) {
      return failure({
        code: 'OutputWriteFailed',
        path: item.destinationPath,
        phase: 'prepare',
        ...systemErrorDetail(cause),
      });
    }
    const expected = snapshots.get(item.artifactId);
    if (expected === undefined || !snapshotsEqual(expected, current)) {
      return failure({ code: 'OutputChangedAfterPreflight', path: item.destinationPath });
    }
  }

  const temporaryPaths: string[] = [];
  const createdDirectories: string[] = [];
  const prepared: PreparedFile[] = [];
  const replacements: ReplacementState[] = [];
  try {
    for (const item of preflighted.plan.items) {
      const artifact = byId.get(item.artifactId)!;
      await ensureDirectories(
        preflighted.plan.rootDirectory,
        path.dirname(item.destinationPath),
        createdDirectories,
      );
      const temporaryPath = path.join(
        path.dirname(item.destinationPath),
        `.templify-new-${randomUUID()}`,
      );
      await writeFile(temporaryPath, artifact.bytes, { flag: 'wx' });
      temporaryPaths.push(temporaryPath);
      prepared.push({
        artifactId: item.artifactId,
        temporaryPath,
        destinationPath: item.destinationPath,
        replaceExisting: snapshots.get(item.artifactId)?.kind === 'file',
      });
    }
  } catch (cause) {
    const warnings = await rollbackPublication([], temporaryPaths, createdDirectories);
    return failure(
      {
        code: 'OutputWriteFailed',
        path: prepared.at(-1)?.destinationPath ?? preflighted.plan.rootDirectory,
        phase: 'prepare',
        ...systemErrorDetail(cause),
      },
      warnings,
    );
  }

  try {
    for (const file of prepared) {
      const state = await replaceOutputFile(
        file.temporaryPath,
        file.destinationPath,
        file.replaceExisting,
      );
      temporaryPaths.splice(temporaryPaths.indexOf(file.temporaryPath), 1);
      replacements.push(state);
    }
  } catch (cause) {
    if (cause instanceof ReplacementFailure) replacements.push(cause.state);
    const warnings = await rollbackPublication(replacements, temporaryPaths, createdDirectories);
    return failure(
      {
        code: 'OutputWriteFailed',
        path:
          cause instanceof ReplacementFailure
            ? cause.state.destinationPath
            : (prepared[replacements.length]?.destinationPath ?? preflighted.plan.rootDirectory),
        phase: 'replace',
        ...systemErrorDetail(cause),
      },
      warnings,
    );
  }

  const warnings = await cleanupBackups(replacements);
  const published: PublishedArtifact[] = prepared.map((file) => ({
    artifactId: file.artifactId,
    path: file.destinationPath,
    replacedExisting: file.replaceExisting,
  }));
  return { ok: true, value: { artifacts: published }, warnings };
}

async function snapshot(pathname: string): Promise<TargetSnapshot> {
  try {
    const info = await lstat(pathname);
    if (!info.isFile() || info.isSymbolicLink())
      return { kind: 'file', size: -1, mtimeMs: -1, device: -1, inode: -1 };
    return {
      kind: 'file',
      size: info.size,
      mtimeMs: info.mtimeMs,
      device: info.dev,
      inode: info.ino,
    };
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT')
      return { kind: 'absent' };
    throw cause;
  }
}

async function ensureDirectories(root: string, parent: string, created: string[]): Promise<void> {
  try {
    await mkdir(root);
    created.push(root);
  } catch (cause) {
    if (
      !(typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'EEXIST')
    )
      throw cause;
  }
  const relative = path.relative(root, parent);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      await mkdir(current);
      created.push(current);
    } catch (cause) {
      if (
        !(typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'EEXIST')
      )
        throw cause;
    }
  }
}

function failure(
  error: PublishError,
  warnings: readonly PublishWarning[] = [],
): StageResult<never, PublishError, PublishWarning> {
  return { ok: false, errors: [error], warnings };
}
