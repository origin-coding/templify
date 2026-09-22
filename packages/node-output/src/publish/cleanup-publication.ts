/* eslint-disable no-await-in-loop -- Rollback must unwind replacements in reverse order. */
import { rm, rename, rmdir } from 'node:fs/promises';
import type { PublishWarning } from './publish-diagnostics.js';
import type { ReplacementState } from './replace-output-file.js';
import { systemErrorDetail } from '@/internal/system-error.js';

export async function rollbackPublication(
  replacements: readonly ReplacementState[],
  temporaryPaths: readonly string[],
  createdDirectories: readonly string[],
): Promise<readonly PublishWarning[]> {
  const warnings: PublishWarning[] = [];
  for (const state of [...replacements].reverse()) {
    if (state.installed) await bestEffortRemove(state.destinationPath, 'RollbackFailed', warnings);
    if (state.backupPath !== undefined) {
      try {
        await rename(state.backupPath, state.destinationPath);
      } catch (cause) {
        warnings.push({
          code: 'RollbackFailed',
          path: state.destinationPath,
          ...systemErrorDetail(cause),
        });
      }
    }
  }
  for (const temporaryPath of temporaryPaths)
    await bestEffortRemove(temporaryPath, 'TemporaryFileCleanupFailed', warnings);
  for (const directory of [...createdDirectories].reverse()) {
    try {
      await rmdir(directory);
    } catch {
      /* Preserve non-empty or concurrently used directories. */
    }
  }
  return warnings;
}

export async function cleanupBackups(
  replacements: readonly ReplacementState[],
): Promise<readonly PublishWarning[]> {
  const warnings: PublishWarning[] = [];
  for (const state of replacements) {
    if (state.backupPath !== undefined)
      await bestEffortRemove(state.backupPath, 'BackupCleanupFailed', warnings);
  }
  return warnings;
}

async function bestEffortRemove(
  path: string,
  code: PublishWarning['code'],
  warnings: PublishWarning[],
): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch (cause) {
    warnings.push({ code, path, ...systemErrorDetail(cause) });
  }
}
