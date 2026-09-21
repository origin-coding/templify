import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDocxOutputPlan,
  preflightDocxOutputPlan,
  type CreateDocxOutputPlanInput,
  type DocxOutputPlan,
  type FieldDefinition,
  type RecordData,
} from '../src/index.js';

const fields = [
  { kind: 'scalar', name: 'name', hint: { type: 'string' } },
  { kind: 'scalar', name: 'department', hint: { type: 'string' } },
  { kind: 'scalar', name: 'birthday', hint: { type: 'date' } },
  { kind: 'scalar', name: 'amount', hint: { type: 'number' } },
  { kind: 'scalar', name: 'active', hint: { type: 'boolean' } },
  {
    kind: 'collection',
    name: 'items',
    fields: [{ kind: 'scalar', name: 'itemName', hint: { type: 'string' } }],
  },
] satisfies readonly FieldDefinition[];

describe('createDocxOutputPlan', () => {
  const rootDirectory = path.resolve('planned-output');

  it('expands literals, one-based $index, and top-level scalar fields deterministically', () => {
    const input = {
      fields,
      records: [
        record('Alice', '研发部', new Date('2024-02-03T23:59:59-08:00'), 12.5, true),
        record('Bob', 'Finance', new Date('2025-06-07T00:00:00Z'), 8, false),
      ],
      target: {
        mode: 'directory',
        rootDirectory,
        pathTemplate: '{department}/合同-{$index}-{name}-{birthday}-{amount}-{active}.docx',
      },
    } satisfies CreateDocxOutputPlanInput;

    const first = expectPlan(input);
    const second = expectPlan(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ mode: 'directory', conflictPolicy: 'error' });
    expect(first.items).toEqual([
      {
        recordIndex: 0,
        relativePath: '研发部/合同-1-Alice-2024-02-04-12.5-true.docx',
        destinationPath: path.join(
          rootDirectory,
          '研发部',
          '合同-1-Alice-2024-02-04-12.5-true.docx',
        ),
      },
      {
        recordIndex: 1,
        relativePath: 'Finance/合同-2-Bob-2025-06-07-8-false.docx',
        destinationPath: path.join(rootDirectory, 'Finance', '合同-2-Bob-2025-06-07-8-false.docx'),
      },
    ]);
  });

  it('plans one caller-named DOCX for exactly one record', () => {
    const plan = expectPlan({
      fields,
      records: [record('Alice')],
      target: { mode: 'single-document', rootDirectory, fileName: '{指定名称}.docx' },
    });

    expect(plan).toEqual({
      mode: 'single-document',
      rootDirectory,
      conflictPolicy: 'error',
      items: [
        {
          recordIndex: 0,
          relativePath: '{指定名称}.docx',
          destinationPath: path.join(rootDirectory, '{指定名称}.docx'),
        },
      ],
    });
  });

  it('plans canonical ZIP entries separately from the archive destination', () => {
    const plan = expectPlan({
      fields,
      records: [record('Alice', 'Engineering'), record('Bob', 'Finance')],
      conflictPolicy: 'overwrite',
      target: {
        mode: 'archive',
        rootDirectory,
        fileName: 'documents.ZIP',
        entryPathTemplate: '{department}/{$index}-{name}.docx',
      },
    });

    expect(plan).toEqual({
      mode: 'archive',
      rootDirectory,
      conflictPolicy: 'overwrite',
      archiveFileName: 'documents.ZIP',
      archivePath: path.join(rootDirectory, 'documents.ZIP'),
      items: [
        { recordIndex: 0, relativePath: 'Engineering/1-Alice.docx' },
        { recordIndex: 1, relativePath: 'Finance/2-Bob.docx' },
      ],
    });
  });

  it('rejects empty batches, multiple records for a single target, and nested single names', () => {
    expect(
      createDocxOutputPlan({
        fields,
        records: [],
        target: { mode: 'directory', rootDirectory, pathTemplate: '{$index}.docx' },
      }),
    ).toMatchObject({ ok: false, errors: [{ code: 'InvalidRecordCount' }] });

    expect(
      createDocxOutputPlan({
        fields,
        records: [record('Alice'), record('Bob')],
        target: { mode: 'single-document', rootDirectory, fileName: 'output.docx' },
      }),
    ).toMatchObject({ ok: false, errors: [{ code: 'InvalidRecordCount' }] });

    expect(
      createDocxOutputPlan({
        fields,
        records: [record('Alice')],
        target: { mode: 'single-document', rootDirectory, fileName: 'nested/output.docx' },
      }),
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'InvalidNamingTemplate', reason: 'NestedFilename' }),
      ]),
    });
  });

  it('treats separators inside a placeholder name as field-name text, not hierarchy', () => {
    const unusualFields = [
      ...fields,
      { kind: 'scalar', name: 'division/name', hint: { type: 'string' } },
      { kind: 'scalar', name: 'windows\\name', hint: { type: 'string' } },
    ] satisfies readonly FieldDefinition[];
    const unusualRecord = {
      ...record('Alice'),
      'division/name': 'Division',
      'windows\\name': 'Document',
    } satisfies RecordData;

    const plan = expectPlan({
      fields: unusualFields,
      records: [unusualRecord],
      target: {
        mode: 'directory',
        rootDirectory,
        pathTemplate: '{division/name}/{windows\\name}.docx',
      },
    });

    expect(plan.items[0]?.relativePath).toBe('Division/Document.docx');
  });

  it('only accepts known top-level scalar placeholders', () => {
    const collection = createDocxOutputPlan({
      fields,
      records: [record('Alice')],
      target: { mode: 'directory', rootDirectory, pathTemplate: '{items}.docx' },
    });
    const nestedField = createDocxOutputPlan({
      fields,
      records: [record('Alice')],
      target: { mode: 'directory', rootDirectory, pathTemplate: '{itemName}.docx' },
    });

    expect(collection).toMatchObject({
      ok: false,
      errors: [{ code: 'CollectionNamingPlaceholder', placeholder: 'items' }],
    });
    expect(nestedField).toMatchObject({
      ok: false,
      errors: [{ code: 'UnknownNamingPlaceholder', placeholder: 'itemName' }],
    });
  });

  it.each([
    '{unknown}.docx',
    '{name.docx',
    'name}.docx',
    '{}.docx',
    '/name.docx',
    '../name.docx',
    'C:/name.docx',
    'folder//name.docx',
    'folder\\name.docx',
  ])('returns a structured naming-template error for %j', (pathTemplate) => {
    const result = createDocxOutputPlan({
      fields,
      records: [record('Alice')],
      target: { mode: 'directory', rootDirectory, pathTemplate },
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ severity: 'error' });
  });

  it('reports missing, collection, and type-mismatched naming values with record context', () => {
    const result = createDocxOutputPlan({
      fields,
      records: [
        { department: 'A' },
        { ...record('Bob'), name: [{ itemName: 'nested' }] },
        { ...record('Carol'), amount: 'not-a-number' } as unknown as RecordData,
      ],
      target: {
        mode: 'directory',
        rootDirectory,
        pathTemplate: '{name}-{amount}.docx',
      },
    });

    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'MissingNamingValue',
          recordIndex: 0,
          placeholder: 'name',
        }),
        expect.objectContaining({
          code: 'InvalidNamingValue',
          recordIndex: 1,
          placeholder: 'name',
        }),
        expect.objectContaining({
          code: 'InvalidNamingValue',
          recordIndex: 2,
          placeholder: 'amount',
        }),
      ]),
    });
  });

  it.each([
    ['CON', 'ReservedDeviceName'],
    ['nul.tar', 'ReservedDeviceName'],
    ['bad:name', 'InvalidCharacter'],
    [`bad${String.fromCharCode(1)}name`, 'InvalidCharacter'],
    ['a'.repeat(256), 'FilenameTooLong'],
    ['trailing.', 'TrailingDotOrSpace'],
    ['.', 'DotFilename'],
    ['..', 'DotFilename'],
  ])('rejects the expanded Windows-sensitive name %j', (name, reason) => {
    const result = createDocxOutputPlan({
      fields,
      records: [record(name)],
      target: { mode: 'directory', rootDirectory, pathTemplate: '{name}' },
    });

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'InvalidOutputPath', reason, recordIndex: 0 })],
    });
  });

  it('never lets an interpolated value create directory hierarchy', () => {
    const result = createDocxOutputPlan({
      fields,
      records: [record('../../outside')],
      target: { mode: 'directory', rootDirectory, pathTemplate: 'safe/{name}.docx' },
    });

    expect(result).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({
          code: 'InvalidNamingValue',
          reason: 'InvalidCharacter',
          recordIndex: 0,
        }),
      ],
    });
  });

  it('requires a DOCX extension and a valid archive file name', () => {
    const documentResult = createDocxOutputPlan({
      fields,
      records: [record('Alice')],
      target: { mode: 'directory', rootDirectory, pathTemplate: '{name}.pdf' },
    });
    const archiveResult = createDocxOutputPlan({
      fields,
      records: [record('Alice')],
      target: {
        mode: 'archive',
        rootDirectory,
        fileName: 'CON.zip',
        entryPathTemplate: '{name}.docx',
      },
    });

    expect(documentResult).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ reason: 'UnsupportedExtension' })],
    });
    expect(archiveResult).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ reason: 'ReservedDeviceName' })],
    });
  });

  it('rejects case-insensitive duplicate planned paths regardless of overwrite policy', () => {
    const result = createDocxOutputPlan({
      fields,
      records: [record('Report'), record('report')],
      conflictPolicy: 'overwrite',
      target: { mode: 'directory', rootDirectory, pathTemplate: '{name}.docx' },
    });

    expect(result).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({
          code: 'DuplicateOutputPath',
          recordIndex: 1,
          conflictingRecordIndex: 0,
        }),
      ],
    });
  });

  it('rejects unsupported runtime conflict-policy values without a schema dependency', () => {
    const result = createDocxOutputPlan({
      fields,
      records: [record('Alice')],
      conflictPolicy: 'rename' as never,
      target: { mode: 'directory', rootDirectory, pathTemplate: '{name}.docx' },
    });

    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.objectContaining({ code: 'InvalidConflictPolicy' })]),
    });
  });

  it('does not access the filesystem while creating a plan', () => {
    const missingRoot = path.join(rootDirectory, 'does-not-exist');
    const plan = expectPlan({
      fields,
      records: [record('Alice')],
      target: { mode: 'directory', rootDirectory: missingRoot, pathTemplate: '{name}.docx' },
    });

    expect(plan.rootDirectory).toBe(missingRoot);
  });
});

describe('preflightDocxOutputPlan', () => {
  let temporaryDirectory: string;
  let outputDirectory: string;
  let sourceTemplatePath: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'templify-plan-'));
    outputDirectory = path.join(temporaryDirectory, 'output');
    sourceTemplatePath = path.join(temporaryDirectory, 'template.docx');
    await mkdir(outputDirectory);
    await writeFile(sourceTemplatePath, 'template');
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('accepts new targets and nested directories that do not exist yet', async () => {
    const plan = directoryPlan(outputDirectory, 'new/nested/{name}.docx', [record('Alice')]);

    await expect(preflightDocxOutputPlan(plan, { sourceTemplatePath })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
    });
  });

  it('reports existing files as errors or overwrite warnings', async () => {
    await writeFile(path.join(outputDirectory, 'Alice.docx'), 'existing');
    const errorPlan = directoryPlan(outputDirectory, '{name}.docx', [record('Alice')]);
    const overwritePlan = directoryPlan(
      outputDirectory,
      '{name}.docx',
      [record('Alice')],
      'overwrite',
    );

    await expect(preflightDocxOutputPlan(errorPlan)).resolves.toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputConflict', severity: 'error' })],
    });
    await expect(preflightDocxOutputPlan(overwritePlan)).resolves.toMatchObject({
      ok: true,
      diagnostics: [expect.objectContaining({ code: 'OutputConflict', severity: 'warning' })],
    });
  });

  it('reports archive-file conflicts separately from entry names', async () => {
    await writeFile(path.join(outputDirectory, 'documents.zip'), 'existing archive');
    const plan = expectPlan({
      fields,
      records: [record('Alice')],
      target: {
        mode: 'archive',
        rootDirectory: outputDirectory,
        fileName: 'documents.zip',
        entryPathTemplate: '{name}.docx',
      },
    });

    const result = await preflightDocxOutputPlan(plan);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputConflict' })],
    });
    expect(result.diagnostics[0]).not.toHaveProperty('recordIndex');
  });

  it('distinguishes missing roots, non-directory roots, and target directories', async () => {
    const missingPlan = directoryPlan(path.join(temporaryDirectory, 'missing'), '{name}.docx', [
      record('Alice'),
    ]);
    const regularFile = path.join(temporaryDirectory, 'regular-file');
    await writeFile(regularFile, 'file');
    const fileRootPlan = directoryPlan(regularFile, '{name}.docx', [record('Alice')]);
    await mkdir(path.join(outputDirectory, 'Alice.docx'));
    const directoryTargetPlan = directoryPlan(outputDirectory, '{name}.docx', [record('Alice')]);

    await expect(preflightDocxOutputPlan(missingPlan)).resolves.toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputRootNotFound' })],
    });
    await expect(preflightDocxOutputPlan(fileRootPlan)).resolves.toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputRootNotDirectory' })],
    });
    await expect(preflightDocxOutputPlan(directoryTargetPlan)).resolves.toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputTargetIsDirectory' })],
    });
  });

  it('rejects a target that is the source template or its hard-link alias', async () => {
    const directPlan = directoryPlan(temporaryDirectory, 'template.docx', [record('unused')]);
    await link(sourceTemplatePath, path.join(outputDirectory, 'alias.docx'));
    const aliasPlan = directoryPlan(outputDirectory, 'alias.docx', [record('unused')]);

    await expect(
      preflightDocxOutputPlan(directPlan, { sourceTemplatePath }),
    ).resolves.toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputSameAsTemplate' })],
    });
    await expect(preflightDocxOutputPlan(aliasPlan, { sourceTemplatePath })).resolves.toMatchObject(
      {
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'OutputSameAsTemplate' })],
      },
    );
  });

  it('does not treat a dangling symbolic-link target as an unused name when supported', async () => {
    const danglingPath = path.join(outputDirectory, 'Alice.docx');
    try {
      await symlink(path.join(temporaryDirectory, 'missing.docx'), danglingPath, 'file');
    } catch (error) {
      if (systemCode(error) === 'EPERM') return;
      throw error;
    }
    const plan = directoryPlan(outputDirectory, '{name}.docx', [record('Alice')]);

    await expect(preflightDocxOutputPlan(plan)).resolves.toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'OutputPathUnavailable' })],
    });
  });

  it('rejects an existing symbolic-link parent that escapes the output root when supported', async () => {
    const outsideDirectory = path.join(temporaryDirectory, 'outside');
    await mkdir(outsideDirectory);
    try {
      await symlink(outsideDirectory, path.join(outputDirectory, 'linked'), 'junction');
    } catch (error) {
      if (systemCode(error) === 'EPERM') return;
      throw error;
    }
    const plan = directoryPlan(outputDirectory, '{department}/{name}.docx', [
      record('Alice', 'linked'),
    ]);

    await expect(preflightDocxOutputPlan(plan)).resolves.toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'InvalidOutputPath', reason: 'OutsideOutputRoot' }),
      ],
    });
  });
});

function record(
  name: string,
  department = 'Engineering',
  birthday = new Date('2024-01-02T00:00:00Z'),
  amount = 1,
  active = true,
): RecordData {
  return { name, department, birthday, amount, active, items: [] };
}

function expectPlan(input: CreateDocxOutputPlanInput): DocxOutputPlan {
  const result = createDocxOutputPlan(input);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(`Expected a valid plan: ${JSON.stringify(result.errors)}`);
  return result.plan;
}

function directoryPlan(
  rootDirectory: string,
  pathTemplate: string,
  records: readonly RecordData[],
  conflictPolicy: 'error' | 'overwrite' = 'error',
): DocxOutputPlan {
  return expectPlan({
    fields,
    records,
    conflictPolicy,
    target: { mode: 'directory', rootDirectory, pathTemplate },
  });
}

function systemCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error as { readonly code?: unknown };
  return typeof code === 'string' ? code : undefined;
}
