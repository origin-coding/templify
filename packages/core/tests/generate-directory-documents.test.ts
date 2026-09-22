import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import PizZip from 'pizzip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BatchRenderFailedError,
  DirectoryOutputFailedError,
  createDocxOutputPlan,
  executeDirectoryDocumentGeneration,
  inspectTemplate,
  type DirectoryOutputPlan,
  type RecordData,
} from '../src/index.js';
import { createDocx } from './docx-fixture.js';

describe('executeDirectoryDocumentGeneration', () => {
  let temporaryDirectory: string;
  let outputDirectory: string;
  let sourceTemplatePath: string;
  let template: Buffer;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'templify-directory-generation-'));
    outputDirectory = path.join(temporaryDirectory, 'output');
    sourceTemplatePath = path.join(temporaryDirectory, 'template.docx');
    template = createDocx([['Name: {name}'], ['Department: {department}']]);
    await mkdir(outputDirectory);
    await writeFile(sourceTemplatePath, template);
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('writes one document to its exact accepted path', async () => {
    const records = [record('Alice', 'Engineering')];
    const plan = directoryPlan(records, 'result.docx');

    const result = await executeDirectoryDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: true,
      outputs: [{ item: plan.items[0], path: plan.items[0]?.destinationPath }],
    });
    if (!result.ok) throw new Error('Expected directory generation to succeed.');
    expect(readDocumentXml(await readFile(result.outputs[0]!.path))).toContain('Name: Alice');
  });

  it('preserves record order and safely creates nested Unicode directories', async () => {
    const records = [record('Alice', '工程'), record('Bob', 'Finance')];
    const plan = directoryPlan(records, 'forms/{department}/{$index}-{name}.docx');

    const result = await executeDirectoryDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: true,
      outputs: [
        { item: plan.items[0], path: plan.items[0]?.destinationPath },
        { item: plan.items[1], path: plan.items[1]?.destinationPath },
      ],
    });
    if (!result.ok) throw new Error('Expected directory generation to succeed.');

    expect(readDocumentXml(await readFile(result.outputs[0]!.path))).toContain('Name: Alice');
    expect(readDocumentXml(await readFile(result.outputs[1]!.path))).toContain('Name: Bob');
  });

  it('applies shared render options to every generated document', async () => {
    const formattedTemplate = createDocx([['Amount: {amount:number}']]);
    const records = [{ amount: 1234.5 }, { amount: 6789 }];
    const plan = directoryPlan(records, '{$index}.docx');

    const result = await executeDirectoryDocumentGeneration({
      template: formattedTemplate,
      records,
      sourceTemplatePath,
      plan,
      renderOptions: {
        formats: [
          {
            path: ['amount'],
            format: {
              type: 'number',
              useGrouping: true,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          },
        ],
      },
    });

    if (!result.ok) throw new Error('Expected directory generation to succeed.');
    expect(readDocumentXml(await readFile(result.outputs[0]!.path))).toContain('1,234.50');
    expect(readDocumentXml(await readFile(result.outputs[1]!.path))).toContain('6,789.00');
  });

  it('publishes no final documents when any record fails to render', async () => {
    const records = [record('Alice', 'Engineering'), { department: 'Finance' }];
    const plan = directoryPlan(records, '{$index}.docx');

    const operation = executeDirectoryDocumentGeneration({
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
    await expect(readdir(outputDirectory)).resolves.toEqual([]);
  });

  it('publishes no documents when render options are invalid', async () => {
    const formattedTemplate = createDocx([['Amount: {amount:number}']]);
    const records = [{ amount: 1 }, { amount: 2 }];
    const plan = directoryPlan(records, '{$index}.docx');

    const operation = executeDirectoryDocumentGeneration({
      template: formattedTemplate,
      records,
      sourceTemplatePath,
      plan,
      renderOptions: {
        formats: [
          {
            path: ['amount'],
            format: { type: 'boolean', trueText: 'Yes', falseText: 'No' },
          },
        ],
      },
    });

    await expect(operation).rejects.toMatchObject({
      code: 'BatchRenderFailed',
      item: { recordIndex: 0 },
      cause: { code: 'InvalidRenderOptions', reason: 'IncompatibleFormatType' },
    });
    await expect(readdir(outputDirectory)).resolves.toEqual([]);
  });

  it('returns a conflict diagnostic without replacing an existing document', async () => {
    const records = [record('Alice', 'Engineering')];
    const targetPath = path.join(outputDirectory, 'Alice.docx');
    await writeFile(targetPath, 'original');
    const plan = directoryPlan(records, '{name}.docx');

    const result = await executeDirectoryDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputConflict', recordIndex: 0 })],
    });
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('original');
  });

  it('replaces existing documents when overwrite is accepted', async () => {
    const records = [record('Alice', 'Engineering')];
    const targetPath = path.join(outputDirectory, 'Alice.docx');
    await writeFile(targetPath, 'original');
    const plan = directoryPlan(records, '{name}.docx', 'overwrite');

    const result = await executeDirectoryDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({ ok: true, outputs: [{ path: targetPath }] });
    expect(readDocumentXml(await readFile(targetPath))).toContain('Name: Alice');
  });

  it('reports completed outputs and the failed item when publication fails partway through', async () => {
    const secondTarget = path.join(outputDirectory, '2.docx');
    const secondRecord = Object.defineProperty({ department: 'Finance' }, 'name', {
      enumerable: true,
      get(): string {
        if (!existsSync(secondTarget)) mkdirSync(secondTarget);
        return 'Bob';
      },
    }) as RecordData;
    const records = [record('Alice', 'Engineering'), secondRecord];
    const plan = directoryPlan(records, '{$index}.docx');

    const error = await captureAsyncError(
      executeDirectoryDocumentGeneration({
        template,
        records,
        sourceTemplatePath,
        plan,
      }),
    );

    expect(error).toBeInstanceOf(DirectoryOutputFailedError);
    expect(error).toMatchObject({
      code: 'DirectoryOutputFailed',
      failedItem: { recordIndex: 1, relativePath: '2.docx' },
      completedOutputs: [{ item: { recordIndex: 0 }, path: path.join(outputDirectory, '1.docx') }],
      cause: { code: 'OutputTargetIsDirectory' },
    });
    await expect(readFile(path.join(outputDirectory, '1.docx'))).resolves.toBeInstanceOf(Buffer);
  });

  it('rejects a tampered unsafe plan before rendering or writing', async () => {
    const records = [record('Alice', 'Engineering')];
    const original = directoryPlan(records, 'Alice.docx');
    const plan: DirectoryOutputPlan = {
      ...original,
      items: [
        {
          ...original.items[0]!,
          relativePath: '../escape.docx',
          destinationPath: path.join(temporaryDirectory, 'escape.docx'),
        },
      ],
    };

    const result = await executeDirectoryDocumentGeneration({
      template,
      records,
      sourceTemplatePath,
      plan,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'InvalidOutputPlan', recordIndex: 0 })],
    });
    expect(existsSync(path.join(temporaryDirectory, 'escape.docx'))).toBe(false);
  });

  function directoryPlan(
    records: readonly RecordData[],
    pathTemplate: string,
    conflictPolicy: 'error' | 'overwrite' = 'error',
  ): DirectoryOutputPlan {
    const result = createDocxOutputPlan({
      records,
      fields: inspectTemplate(template),
      conflictPolicy,
      target: { mode: 'directory', rootDirectory: outputDirectory, pathTemplate },
    });

    if (!result.ok) throw new Error(`Expected a valid plan: ${JSON.stringify(result.errors)}`);
    if (result.plan.mode !== 'directory') throw new Error('Expected a directory plan.');
    return result.plan;
  }
});

function record(name: string, department: string): RecordData {
  return { name, department };
}

function readDocumentXml(document: Buffer): string {
  return new PizZip(document).file('word/document.xml')?.asText() ?? '';
}

async function captureAsyncError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }

  return undefined;
}
