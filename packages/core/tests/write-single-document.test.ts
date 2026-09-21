import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  InvalidOutputFilenameError,
  InvalidOutputPathError,
  OutputConflictError,
  OutputDirectoryNotFoundError,
  OutputSameAsTemplateError,
  OutputTargetIsDirectoryError,
  UnsafeOutputPathError,
  writeSingleDocument,
} from '../src/index.js';

describe('writeSingleDocument', () => {
  let temporaryDirectory: string;
  let outputDirectory: string;
  let sourceTemplatePath: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'templify-output-'));
    outputDirectory = path.join(temporaryDirectory, 'output');
    sourceTemplatePath = path.join(temporaryDirectory, 'template.docx');
    await mkdir(outputDirectory);
    await writeFile(sourceTemplatePath, 'source template');
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('writes a new Unicode-named document byte-for-byte and reports its normalized path', async () => {
    const document = Buffer.from([0, 1, 2, 127, 128, 255]);
    const result = await writeSingleDocument(
      document,
      { rootDirectory: path.join(outputDirectory, '.'), fileName: '合同-😀.DOCX' },
      { sourceTemplatePath },
    );

    expect(result).toEqual({
      path: path.join(outputDirectory, '合同-😀.DOCX'),
      bytesWritten: document.byteLength,
    });
    await expect(readFile(result.path)).resolves.toEqual(document);
  });

  it('requires an absolute, existing directory as the output root', async () => {
    await expect(
      writeSingleDocument(
        Buffer.from('output'),
        { rootDirectory: 'relative', fileName: 'output.docx' },
        { sourceTemplatePath },
      ),
    ).rejects.toMatchObject({
      code: 'InvalidOutputPath',
      reason: 'RootNotAbsolute',
      phase: 'validation',
    });

    await expect(
      writeSingleDocument(
        Buffer.from('output'),
        { rootDirectory: path.join(temporaryDirectory, 'missing'), fileName: 'output.docx' },
        { sourceTemplatePath },
      ),
    ).rejects.toBeInstanceOf(OutputDirectoryNotFoundError);

    const regularFile = path.join(temporaryDirectory, 'not-a-directory');
    await writeFile(regularFile, 'file');
    await expect(
      writeSingleDocument(
        Buffer.from('output'),
        { rootDirectory: regularFile, fileName: 'output.docx' },
        { sourceTemplatePath },
      ),
    ).rejects.toMatchObject({
      code: 'InvalidOutputPath',
      reason: 'RootNotDirectory',
    });
  });

  it.each([
    ['', 'EmptyFilename'],
    [path.resolve('absolute.docx'), 'AbsoluteFilename'],
    ['nested/output.docx', 'NestedFilename'],
    ['nested\\output.docx', 'NestedFilename'],
    ['bad:name.docx', 'InvalidCharacter'],
    ['bad\u0001name.docx', 'InvalidCharacter'],
    ['bad.docx ', 'TrailingDotOrSpace'],
    ['CON.docx', 'ReservedDeviceName'],
    ['nul.tar.docx', 'ReservedDeviceName'],
    ['COM1.docx', 'ReservedDeviceName'],
    ['output.txt', 'UnsupportedExtension'],
    [`${'a'.repeat(251)}.docx`, 'FilenameTooLong'],
  ])('rejects the invalid Windows-compatible file name %j', async (fileName, reason) => {
    const operation = writeSingleDocument(
      Buffer.from('output'),
      { rootDirectory: outputDirectory, fileName },
      { sourceTemplatePath },
    );

    await expect(operation).rejects.toBeInstanceOf(InvalidOutputFilenameError);
    await expect(operation).rejects.toMatchObject({ reason, phase: 'validation' });
    await expect(readdir(outputDirectory)).resolves.toEqual([]);
  });

  it.each(['../escape.docx', '..\\escape.docx'])(
    'rejects the traversal attempt %j as unsafe',
    async (fileName) => {
      await expect(
        writeSingleDocument(
          Buffer.from('output'),
          { rootDirectory: outputDirectory, fileName },
          { sourceTemplatePath },
        ),
      ).rejects.toBeInstanceOf(UnsafeOutputPathError);
    },
  );

  it('reports a target directory separately from a file conflict', async () => {
    await mkdir(path.join(outputDirectory, 'folder.docx'));

    await expect(
      writeSingleDocument(
        Buffer.from('output'),
        { rootDirectory: outputDirectory, fileName: 'folder.docx' },
        { sourceTemplatePath },
      ),
    ).rejects.toBeInstanceOf(OutputTargetIsDirectoryError);
  });

  it('defaults to exclusive creation and preserves existing content on conflict', async () => {
    const targetPath = path.join(outputDirectory, 'existing.docx');
    await writeFile(targetPath, 'original');

    const error = await captureError(
      writeSingleDocument(
        Buffer.from('replacement'),
        { rootDirectory: outputDirectory, fileName: 'existing.docx' },
        { sourceTemplatePath },
      ),
    );

    expect(error).toBeInstanceOf(OutputConflictError);
    expect(error).toMatchObject({
      code: 'OutputConflict',
      reason: 'TargetExists',
      phase: 'target-creation',
      systemCode: 'EEXIST',
    });
    expect(error).toHaveProperty('cause');
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('original');
  });

  it('replaces an existing file through a temporary file and cleans up staging artifacts', async () => {
    const targetPath = path.join(outputDirectory, 'existing.docx');
    await writeFile(targetPath, 'original');

    const result = await writeSingleDocument(
      Buffer.from('replacement'),
      { rootDirectory: outputDirectory, fileName: 'existing.docx' },
      { sourceTemplatePath, conflictPolicy: 'overwrite' },
    );

    expect(result).toEqual({ path: targetPath, bytesWritten: 11 });
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('replacement');
    await expect(readdir(outputDirectory)).resolves.toEqual(['existing.docx']);
  });

  it('does not replace the source template through direct or normalized paths', async () => {
    const sourceDirectory = path.dirname(sourceTemplatePath);
    const original = await readFile(sourceTemplatePath);

    await expect(
      writeSingleDocument(
        Buffer.from('replacement'),
        { rootDirectory: path.join(sourceDirectory, 'output', '..'), fileName: 'template.docx' },
        { sourceTemplatePath, conflictPolicy: 'overwrite' },
      ),
    ).rejects.toBeInstanceOf(OutputSameAsTemplateError);

    await expect(readFile(sourceTemplatePath)).resolves.toEqual(original);
  });

  it('does not replace a symbolic-link alias of the source template when supported', async () => {
    const aliasPath = path.join(outputDirectory, 'alias.docx');
    try {
      await symlink(sourceTemplatePath, aliasPath, 'file');
    } catch (error) {
      if (systemCode(error) === 'EPERM') return;
      throw error;
    }

    await expect(
      writeSingleDocument(
        Buffer.from('replacement'),
        { rootDirectory: outputDirectory, fileName: 'alias.docx' },
        { sourceTemplatePath, conflictPolicy: 'overwrite' },
      ),
    ).rejects.toBeInstanceOf(OutputSameAsTemplateError);
  });

  it('does not replace a hard-link alias of the source template', async () => {
    await link(sourceTemplatePath, path.join(outputDirectory, 'hard-link.docx'));

    await expect(
      writeSingleDocument(
        Buffer.from('replacement'),
        { rootDirectory: outputDirectory, fileName: 'hard-link.docx' },
        { sourceTemplatePath, conflictPolicy: 'overwrite' },
      ),
    ).rejects.toBeInstanceOf(OutputSameAsTemplateError);
  });

  it('requires an absolute source template path', async () => {
    await expect(
      writeSingleDocument(
        Buffer.from('output'),
        { rootDirectory: outputDirectory, fileName: 'output.docx' },
        { sourceTemplatePath: 'template.docx' },
      ),
    ).rejects.toBeInstanceOf(InvalidOutputPathError);
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

function systemCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error as { readonly code?: unknown };
  return typeof code === 'string' ? code : undefined;
}
