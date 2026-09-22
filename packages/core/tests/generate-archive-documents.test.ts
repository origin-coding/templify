import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import PizZip from 'pizzip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BatchRenderFailedError,
  createDocxOutputPlan,
  executeArchiveDocumentGeneration,
  inspectTemplate,
  type ArchiveOutputPlan,
  type RecordData,
} from '../src/index.js';
import { createDocx } from './docx-fixture.js';

describe('executeArchiveDocumentGeneration', () => {
  let temporaryDirectory: string;
  let outputDirectory: string;
  let sourceTemplatePath: string;
  let template: Buffer;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'templify-archive-generation-'));
    outputDirectory = path.join(temporaryDirectory, 'output');
    sourceTemplatePath = path.join(temporaryDirectory, 'template.docx');
    template = createDocx([['Name: {name}'], ['Department: {department}']]);
    await mkdir(outputDirectory);
    await writeFile(sourceTemplatePath, template);
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('writes one rendered DOCX entry and reports its archive metadata', async () => {
    const records = [record('Alice', 'Engineering')];
    const plan = archivePlan(records, 'documents.zip', '{name}.docx');

    const result = await executeArchiveDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: true,
      path: plan.archivePath,
      entryCount: 1,
      entries: [{ item: plan.items[0], entryPath: 'Alice.docx' }],
    });
    if (!result.ok) throw new Error('Expected archive generation to succeed.');
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(result.entries[0]!.documentBytes).toBeGreaterThan(0);

    const archive = new PizZip(await readFile(result.path));
    const document = archive.file('Alice.docx')?.asNodeBuffer();
    expect(document).toBeInstanceOf(Buffer);
    expect(readDocumentXml(document!)).toContain('Name: Alice');
  });

  it('preserves entry order and nested Unicode paths without intermediate DOCX files', async () => {
    const records = [record('Alice', '工程'), record('Bob', 'Finance')];
    const plan = archivePlan(records, '批量文档.zip', 'forms/{department}/{$index}-{name}.docx');

    const result = await executeArchiveDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: true,
      entryCount: 2,
      entries: [
        { item: plan.items[0], entryPath: 'forms/工程/1-Alice.docx' },
        { item: plan.items[1], entryPath: 'forms/Finance/2-Bob.docx' },
      ],
    });
    await expect(readdir(outputDirectory)).resolves.toEqual(['批量文档.zip']);

    const archive = new PizZip(await readFile(plan.archivePath));
    expect(Object.keys(archive.files)).toEqual([
      'forms/工程/1-Alice.docx',
      'forms/Finance/2-Bob.docx',
    ]);
    expect(readDocumentXml(archive.file('forms/工程/1-Alice.docx')!.asNodeBuffer())).toContain(
      'Name: Alice',
    );
    expect(readDocumentXml(archive.file('forms/Finance/2-Bob.docx')!.asNodeBuffer())).toContain(
      'Name: Bob',
    );
  });

  it('publishes no archive when any record fails to render', async () => {
    const records = [record('Alice', 'Engineering'), { department: 'Finance' }];
    const plan = archivePlan(records, 'documents.zip', '{$index}.docx');

    const operation = executeArchiveDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    await expect(operation).rejects.toBeInstanceOf(BatchRenderFailedError);
    await expect(operation).rejects.toMatchObject({
      code: 'BatchRenderFailed',
      item: { recordIndex: 1 },
      cause: { code: 'MissingInputField' },
    });
    expect(existsSync(plan.archivePath)).toBe(false);
  });

  it('returns a conflict diagnostic without replacing an existing archive', async () => {
    const records = [record('Alice', 'Engineering')];
    const archivePath = path.join(outputDirectory, 'documents.zip');
    await writeFile(archivePath, 'original');
    const plan = archivePlan(records, 'documents.zip', '{name}.docx');

    const result = await executeArchiveDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputConflict' })],
    });
    await expect(readFile(archivePath, 'utf8')).resolves.toBe('original');
  });

  it('replaces an existing archive when overwrite is accepted', async () => {
    const records = [record('Alice', 'Engineering')];
    const archivePath = path.join(outputDirectory, 'documents.zip');
    await writeFile(archivePath, 'original');
    const plan = archivePlan(records, 'documents.zip', '{name}.docx', 'overwrite');

    const result = await executeArchiveDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({ ok: true, path: archivePath, entryCount: 1 });
    expect(new PizZip(await readFile(archivePath)).file('Alice.docx')).not.toBeNull();
  });

  it('detects an archive-file conflict introduced after preflight', async () => {
    const archivePath = path.join(outputDirectory, 'documents.zip');
    const raceRecord = Object.defineProperty({ department: 'Engineering' }, 'name', {
      enumerable: true,
      get(): string {
        if (!existsSync(archivePath)) writeFileSync(archivePath, 'racing writer');
        return 'Alice';
      },
    }) as RecordData;
    const records = [raceRecord];
    const plan = archivePlan(records, 'documents.zip', '{$index}.docx');

    const operation = executeArchiveDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    await expect(operation).rejects.toMatchObject({
      code: 'OutputConflict',
      reason: 'TargetExists',
    });
    await expect(readFile(archivePath, 'utf8')).resolves.toBe('racing writer');
  });

  it('rejects duplicate entries in a tampered plan before rendering', async () => {
    const records = [record('Alice', 'Engineering'), record('Bob', 'Finance')];
    const original = archivePlan(records, 'documents.zip', '{$index}.docx');
    const plan: ArchiveOutputPlan = {
      ...original,
      items: [original.items[0]!, { ...original.items[1]!, relativePath: '1.docx' }],
    };

    const result = await executeArchiveDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'InvalidOutputPlan', recordIndex: 1 })],
    });
    expect(existsSync(plan.archivePath)).toBe(false);
  });

  it.each(['../escape.docx', '/absolute.docx', 'nested\\file.docx', 'nested//file.docx'])(
    'rejects the unsafe tampered entry path %j before rendering',
    async (relativePath) => {
      const records = [record('Alice', 'Engineering')];
      const original = archivePlan(records, 'documents.zip', 'Alice.docx');
      const plan: ArchiveOutputPlan = {
        ...original,
        items: [{ ...original.items[0]!, relativePath }],
      };

      const result = await executeArchiveDocumentGeneration({
        template,
        records,
        sourceTemplatePath,
        plan,
      });

      expect(result).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'InvalidOutputPlan', recordIndex: 0 })],
      });
      expect(existsSync(plan.archivePath)).toBe(false);
    },
  );

  function archivePlan(
    records: readonly RecordData[],
    fileName: string,
    entryPathTemplate: string,
    conflictPolicy: 'error' | 'overwrite' = 'error',
  ): ArchiveOutputPlan {
    const result = createDocxOutputPlan({
      records,
      fields: inspectTemplate(template),
      conflictPolicy,
      target: {
        mode: 'archive',
        rootDirectory: outputDirectory,
        fileName,
        entryPathTemplate,
      },
    });

    if (!result.ok) throw new Error(`Expected a valid plan: ${JSON.stringify(result.errors)}`);
    if (result.plan.mode !== 'archive') throw new Error('Expected an archive plan.');
    return result.plan;
  }
});

function record(name: string, department: string): RecordData {
  return { name, department };
}

function readDocumentXml(document: Buffer): string {
  return new PizZip(document).file('word/document.xml')?.asText() ?? '';
}
