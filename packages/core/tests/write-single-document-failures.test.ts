import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fileSystemMocks = vi.hoisted(() => ({
  rename: vi.fn<typeof import('node:fs/promises').rename>(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  fileSystemMocks.rename.mockImplementation(actual.rename);
  return { ...actual, rename: fileSystemMocks.rename };
});

import { OutputPermissionDeniedError, writeSingleDocument } from '../src/index.js';
import { mapSystemError } from '../src/write-single-document.js';

describe('single-document filesystem failure handling', () => {
  let temporaryDirectory: string;
  let outputDirectory: string;
  let sourceTemplatePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'templify-output-failure-'));
    outputDirectory = path.join(temporaryDirectory, 'output');
    sourceTemplatePath = path.join(temporaryDirectory, 'template.docx');
    await mkdir(outputDirectory);
    await writeFile(sourceTemplatePath, 'source template');
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('preserves the prior target and removes the temporary file when replacement fails', async () => {
    const targetPath = path.join(outputDirectory, 'output.docx');
    await writeFile(targetPath, 'original');
    const cause = systemError('EPERM');
    fileSystemMocks.rename.mockRejectedValueOnce(cause);

    const error = await captureError(
      writeSingleDocument(
        Buffer.from('replacement'),
        { rootDirectory: outputDirectory, fileName: 'output.docx' },
        { sourceTemplatePath, conflictPolicy: 'overwrite' },
      ),
    );

    expect(error).toBeInstanceOf(OutputPermissionDeniedError);
    expect(error).toMatchObject({
      code: 'OutputPermissionDenied',
      reason: 'AccessDeniedOrFileInUse',
      phase: 'replacement',
      systemCode: 'EPERM',
      cause,
    });
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('original');
    await expect(readdir(outputDirectory)).resolves.toEqual(['output.docx']);
  });

  it.each([
    ['EACCES', 'OutputPermissionDenied', 'PermissionDenied'],
    ['EPERM', 'OutputPermissionDenied', 'AccessDeniedOrFileInUse'],
    ['EBUSY', 'OutputPermissionDenied', 'AccessDeniedOrFileInUse'],
    ['ENOSPC', 'OutputWriteFailed', 'DiskFull'],
    ['ENAMETOOLONG', 'InvalidOutputPath', 'PathTooLong'],
    ['EISDIR', 'OutputTargetIsDirectory', 'TargetIsDirectory'],
    ['EIO', 'OutputWriteFailed', 'IoFailure'],
  ] as const)('maps %s to an actionable structured error', (systemCode, code, reason) => {
    const cause = systemError(systemCode);

    expect(mapSystemError(cause, 'output.docx', 'write')).toMatchObject({
      code,
      reason,
      phase: 'write',
      systemCode,
      cause,
    });
  });
});

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }

  return undefined;
}

function systemError(code: string): Error & { readonly code: string } {
  return Object.assign(new Error(`Filesystem failure: ${code}`), { code });
}
