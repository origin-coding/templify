import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { open, realpath, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

import {
  InvalidOutputFilenameError,
  InvalidOutputPathError,
  OutputConflictError,
  OutputDirectoryNotFoundError,
  OutputPermissionDeniedError,
  OutputSameAsTemplateError,
  OutputTargetIsDirectoryError,
  OutputWriteFailedError,
  UnsafeOutputPathError,
  type DocumentOutputError,
  type DocumentOutputErrorOptions,
  type DocumentOutputPhase,
} from './errors.js';
import { isPathContained, validateWindowsFilenameSegment } from './output-path.js';

export interface SingleDocumentTarget {
  /** An existing absolute directory selected by the caller. */
  readonly rootDirectory: string;
  /** A file name only. Nested paths are not accepted. */
  readonly fileName: string;
}

export type ConflictPolicy = 'error' | 'overwrite';

export interface SingleDocumentOutputOptions {
  /** The existing source DOCX path, used to prevent replacing the template. */
  readonly sourceTemplatePath: string;
  readonly conflictPolicy?: ConflictPolicy;
}

export interface SingleDocumentOutputResult {
  readonly path: string;
  readonly bytesWritten: number;
}

interface ValidatedDestination {
  readonly targetPath: string;
  readonly realTargetParent: string;
}

export async function writeSingleDocument(
  document: Buffer,
  target: SingleDocumentTarget,
  options: SingleDocumentOutputOptions,
): Promise<SingleDocumentOutputResult> {
  const destination = await validateDestination(target);
  await ensureDifferentFromTemplate(options.sourceTemplatePath, destination);

  return writeDocumentBuffer(document, destination.targetPath, options.conflictPolicy ?? 'error');
}

async function validateDestination(target: SingleDocumentTarget): Promise<ValidatedDestination> {
  const { rootDirectory, fileName } = target;

  if (!path.isAbsolute(rootDirectory)) {
    throw new InvalidOutputPathError('The output root must be an absolute path.', {
      path: rootDirectory,
      reason: 'RootNotAbsolute',
      phase: 'validation',
    });
  }

  validateFilename(fileName);

  const normalizedRoot = path.resolve(rootDirectory);
  let rootStats: Stats;

  try {
    rootStats = await stat(normalizedRoot);
  } catch (cause) {
    if (systemCode(cause) === 'ENOENT') {
      throw new OutputDirectoryNotFoundError('The output directory does not exist.', {
        path: normalizedRoot,
        reason: 'DirectoryNotFound',
        phase: 'validation',
        cause,
        systemCode: systemCode(cause),
      });
    }

    throw mapSystemError(cause, normalizedRoot, 'validation');
  }

  if (!rootStats.isDirectory()) {
    throw new InvalidOutputPathError('The output root must be a directory.', {
      path: normalizedRoot,
      reason: 'RootNotDirectory',
      phase: 'validation',
    });
  }

  const targetPath = path.resolve(normalizedRoot, fileName);
  assertContained(normalizedRoot, targetPath);

  let realRootDirectory: string;
  let realTargetParent: string;

  try {
    [realRootDirectory, realTargetParent] = await Promise.all([
      realpath(normalizedRoot),
      realpath(path.dirname(targetPath)),
    ]);
  } catch (cause) {
    throw mapSystemError(cause, normalizedRoot, 'validation');
  }

  const realTargetPath = path.resolve(realTargetParent, path.basename(targetPath));
  assertContained(realRootDirectory, realTargetPath);

  return { targetPath, realTargetParent };
}

function validateFilename(fileName: string): void {
  const fail = (message: string, reason: DocumentOutputErrorOptions['reason']): never => {
    throw new InvalidOutputFilenameError(message, {
      path: fileName,
      reason,
      phase: 'validation',
    });
  };

  if (fileName.length === 0) fail('The output file name cannot be empty.', 'EmptyFilename');
  if (path.isAbsolute(fileName) || path.win32.isAbsolute(fileName)) {
    fail('The output file name cannot be absolute.', 'AbsoluteFilename');
  }
  if (fileName === '.' || fileName === '..')
    fail('The output file name is not valid.', 'DotFilename');
  if (fileName.split(/[/\\]/u).includes('..')) {
    throw new UnsafeOutputPathError('The output file name contains a traversal segment.', {
      path: fileName,
      reason: 'OutsideOutputRoot',
      phase: 'validation',
    });
  }
  if (fileName.includes('/') || fileName.includes('\\')) {
    fail('The output file name cannot contain a directory path.', 'NestedFilename');
  }
  const segmentReason = validateWindowsFilenameSegment(fileName);
  if (segmentReason !== undefined) {
    fail('The output file name is not Windows-compatible.', segmentReason);
  }
  if (path.extname(fileName).toLocaleLowerCase('en-US') !== '.docx') {
    fail('The output file name must use the .docx extension.', 'UnsupportedExtension');
  }
}

function assertContained(root: string, candidate: string): void {
  if (isPathContained(root, candidate)) return;

  throw new UnsafeOutputPathError('The output path escapes the selected output directory.', {
    path: candidate,
    reason: 'OutsideOutputRoot',
    phase: 'validation',
  });
}

async function ensureDifferentFromTemplate(
  sourceTemplatePath: string,
  destination: ValidatedDestination,
): Promise<void> {
  if (!path.isAbsolute(sourceTemplatePath)) {
    throw new InvalidOutputPathError('The source template path must be absolute.', {
      path: sourceTemplatePath,
      reason: 'RootNotAbsolute',
      phase: 'validation',
    });
  }

  const normalizedSource = path.resolve(sourceTemplatePath);
  const reconstructedTarget = path.resolve(
    destination.realTargetParent,
    path.basename(destination.targetPath),
  );

  if (pathsEqual(normalizedSource, destination.targetPath)) throwSameFile(destination.targetPath);

  let realSource: string;
  try {
    realSource = await realpath(normalizedSource);
  } catch (cause) {
    throw mapSystemError(cause, normalizedSource, 'validation');
  }

  let realTarget: string | undefined;
  try {
    realTarget = await realpath(destination.targetPath);
  } catch (cause) {
    if (systemCode(cause) !== 'ENOENT') {
      throw mapSystemError(cause, destination.targetPath, 'validation');
    }
  }

  if (pathsEqual(realSource, realTarget ?? reconstructedTarget)) {
    throwSameFile(destination.targetPath);
  }

  if (realTarget !== undefined) {
    const [sourceStats, targetStats] = await Promise.all([stat(realSource), stat(realTarget)]);
    if (sourceStats.dev === targetStats.dev && sourceStats.ino === targetStats.ino) {
      throwSameFile(destination.targetPath);
    }
  }
}

function pathsEqual(left: string, right: string): boolean {
  if (process.platform === 'win32') {
    return left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US');
  }
  return left === right;
}

function throwSameFile(targetPath: string): never {
  throw new OutputSameAsTemplateError('The output file cannot replace the source template.', {
    path: targetPath,
    reason: 'SameFile',
    phase: 'validation',
  });
}

async function writeDocumentBuffer(
  document: Buffer,
  targetPath: string,
  conflictPolicy: ConflictPolicy,
): Promise<SingleDocumentOutputResult> {
  await rejectExistingDirectory(targetPath);

  if (conflictPolicy === 'overwrite') {
    await writeWithReplacement(document, targetPath);
  } else {
    await writeExclusive(document, targetPath);
  }

  return { path: targetPath, bytesWritten: document.byteLength };
}

async function rejectExistingDirectory(targetPath: string): Promise<void> {
  try {
    const targetStats = await stat(targetPath);
    if (targetStats.isDirectory()) {
      // noinspection ExceptionCaughtLocallyJS
      throw new OutputTargetIsDirectoryError('The output target is an existing directory.', {
        path: targetPath,
        reason: 'TargetIsDirectory',
        phase: 'validation',
      });
    }
  } catch (cause) {
    if (cause instanceof OutputTargetIsDirectoryError) throw cause;
    if (systemCode(cause) === 'ENOENT') return;
    throw mapSystemError(cause, targetPath, 'validation');
  }
}

async function writeExclusive(document: Buffer, targetPath: string): Promise<void> {
  let handle: FileHandle | undefined;
  let created = false;
  let phase: DocumentOutputPhase = 'target-creation';

  try {
    handle = await open(targetPath, 'wx');
    created = true;
    phase = 'write';
    await handle.writeFile(document);
    phase = 'flush';
    await handle.sync();
    phase = 'close';
    await handle.close();
    handle = undefined;
  } catch (cause) {
    await closeQuietly(handle);
    if (created) await unlinkQuietly(targetPath);
    if (systemCode(cause) === 'EEXIST') {
      throw new OutputConflictError('The output file already exists.', {
        path: targetPath,
        reason: 'TargetExists',
        phase,
        cause,
        systemCode: systemCode(cause),
      });
    }
    throw mapSystemError(cause, targetPath, phase);
  }
}

async function writeWithReplacement(document: Buffer, targetPath: string): Promise<void> {
  const temporaryPath = path.join(path.dirname(targetPath), `.templify-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  let temporaryCreated = false;
  let phase: DocumentOutputPhase = 'temporary-file-creation';

  try {
    handle = await open(temporaryPath, 'wx');
    temporaryCreated = true;
    phase = 'write';
    await handle.writeFile(document);
    phase = 'flush';
    await handle.sync();
    phase = 'close';
    await handle.close();
    handle = undefined;
    phase = 'replacement';
    await rename(temporaryPath, targetPath);
    temporaryCreated = false;
  } catch (cause) {
    await closeQuietly(handle);
    if (temporaryCreated) await unlinkQuietly(temporaryPath);
    throw mapSystemError(cause, targetPath, phase);
  }
}

async function closeQuietly(handle: FileHandle | undefined): Promise<void> {
  if (handle === undefined) return;
  try {
    await handle.close();
  } catch {
    // Preserve the primary operation error.
  }
}

async function unlinkQuietly(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Cleanup is best-effort and must not hide the primary write error.
  }
}

export function mapSystemError(
  cause: unknown,
  targetPath: string,
  phase: DocumentOutputPhase,
): DocumentOutputError {
  const code = systemCode(cause);
  const options = { path: targetPath, phase, cause, systemCode: code };

  if (code === 'EACCES') {
    return new OutputPermissionDeniedError('Permission was denied while writing the output file.', {
      ...options,
      reason: 'PermissionDenied',
    });
  }
  if (code === 'EPERM' || code === 'EBUSY') {
    return new OutputPermissionDeniedError(
      'The output file is not writable. It may be open in another application.',
      { ...options, reason: 'AccessDeniedOrFileInUse' },
    );
  }
  if (code === 'ENAMETOOLONG') {
    return new InvalidOutputPathError('The output path is too long for the filesystem.', {
      ...options,
      reason: 'PathTooLong',
    });
  }
  if (code === 'EISDIR' || code === 'ENOTDIR') {
    return new OutputTargetIsDirectoryError('The output target is an existing directory.', {
      ...options,
      reason: 'TargetIsDirectory',
    });
  }

  return new OutputWriteFailedError(
    code === 'ENOSPC'
      ? 'There is not enough space to write the output file.'
      : 'The output file could not be written.',
    { ...options, reason: code === 'ENOSPC' ? 'DiskFull' : 'IoFailure' },
  );
}

function systemCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error as { readonly code?: unknown };
  return typeof code === 'string' ? code : undefined;
}
