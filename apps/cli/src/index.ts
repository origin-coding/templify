#!/usr/bin/env node
import { readFile, writeFile, lstat, stat, rename, unlink, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConsola } from 'consola/basic';
import { cli, define, isCommandNotFoundError } from 'gunshi';
import { getBorderCharacters, table } from 'table';
import {
  derivePublicationManifest,
  generateArtifacts,
  packageArtifacts,
  prepareGeneration,
  prepareTemplate,
  type StageResult,
  type TemplateDefinition,
} from '@templify/core';
import {
  createPublicationPlan,
  preflightPublication,
  publishArtifacts,
} from '@templify/node-output';
import packageJson from '../package.json' with { type: 'json' };
import { formatDiagnostic } from './format-diagnostic';

const diagnostics = createConsola({ stdout: process.stderr, stderr: process.stderr });

class CliFailure extends Error {
  readonly exitCode: 1 | 2;

  constructor(message: string, exitCode: 1 | 2 = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const inspect = define({
  name: 'inspect',
  description: 'Inspect fields in a DOCX template.',
  args: {
    template: { type: 'positional', description: 'DOCX template path' },
    format: {
      type: 'enum',
      choices: ['table', 'json'],
      default: 'table',
      description: 'Output format',
    },
    output: { type: 'string', description: 'Write the result to this file' },
    overwrite: { type: 'boolean', description: 'Replace an existing output file' },
  },
  async run(ctx) {
    const templatePath = path.resolve(ctx.values.template);
    const definition = await inspectTemplate(templatePath);
    const content =
      ctx.values.format === 'json'
        ? `${JSON.stringify(definition, null, 2)}\n`
        : renderFieldTable(definition);
    if (ctx.values.output) {
      await writeInspectionOutput(
        path.resolve(ctx.values.output),
        templatePath,
        content,
        Boolean(ctx.values.overwrite),
      );
    } else {
      process.stdout.write(content);
    }
  },
});

const generate = define({
  name: 'generate',
  description: 'Generate one DOCX from manually supplied field values.',
  args: {
    template: { type: 'positional', description: 'DOCX template path' },
    set: { type: 'string', multiple: true, description: 'Field value (repeat: --set field=value)' },
    outputFile: {
      type: 'string',
      toKebab: true,
      required: true,
      description: 'Output DOCX path',
    },
    overwrite: { type: 'boolean', description: 'Replace an existing output file' },
    dryRun: {
      type: 'boolean',
      toKebab: true,
      description: 'Validate and show the publication action without writing',
    },
  },
  async run(ctx) {
    const templatePath = path.resolve(ctx.values.template);
    const outputPath = path.resolve(ctx.values.outputFile);
    const source = await readFile(templatePath);
    const prepared = requireStage(prepareTemplate(source));
    const record = parseSetValues(ctx.values.set ?? []);
    const generation = requireStage(
      prepareGeneration({
        template: prepared,
        input: { kind: 'object-rows', rows: [record] },
        request: {
          naming: { kind: 'single', fileName: path.basename(outputPath) },
          documentOutputs: 'docx',
        },
      }),
    );
    const publicationPlan = requireStage(
      createPublicationPlan({
        manifest: derivePublicationManifest(generation.plan),
        rootDirectory: path.dirname(outputPath),
        conflictPolicy: ctx.values.overwrite ? 'overwrite' : 'error',
        protectedPaths: [templatePath],
      }),
    );
    const preflighted = requireStage(await preflightPublication(publicationPlan));
    if (ctx.values.dryRun) {
      for (const item of preflighted.items) {
        process.stdout.write(`${item.action}\t${item.destinationPath}\n`);
      }
      return;
    }
    const generated = requireStage(await generateArtifacts(generation));
    const packaged = requireStage(packageArtifacts(generation.plan, generated));
    const published = requireStage(await publishArtifacts(preflighted, packaged));
    for (const artifact of published.artifacts) process.stdout.write(`${artifact.path}\n`);
  },
});

async function inspectTemplate(templatePath: string): Promise<TemplateDefinition> {
  const source = await readFile(templatePath);
  return requireStage(prepareTemplate(source)).definition;
}

function parseSetValues(values: readonly string[]): Record<string, string> {
  const record: Record<string, string> = Object.create(null);
  for (const value of values) {
    const separator = value.indexOf('=');
    if (separator <= 0)
      throw new CliFailure(
        `Invalid --set value ${JSON.stringify(value)}; expected field=value.`,
        2,
      );
    const field = value.slice(0, separator);
    if (Object.hasOwn(record, field)) throw new CliFailure(`Duplicate --set field: ${field}.`, 2);
    record[field] = value.slice(separator + 1);
  }
  return record;
}

function renderFieldTable(definition: TemplateDefinition): string {
  const rows = definition.fields.map((field) => [
    field.name,
    field.kind === 'scalar' ? field.hint.type : 'collection',
    field.kind === 'scalar' && field.hint.type === 'option' ? field.hint.values.join(', ') : '',
  ]);
  return table([['FIELD', 'TYPE', 'OPTIONS'], ...rows], {
    border: getBorderCharacters('norc'),
    drawHorizontalLine: (index, rowCount) => index === 0 || index === 1 || index === rowCount,
  });
}

async function writeInspectionOutput(
  outputPath: string,
  templatePath: string,
  content: string,
  overwrite: boolean,
): Promise<void> {
  if (outputPath === templatePath)
    throw new CliFailure('Output path must differ from the template path.');

  let target: Awaited<ReturnType<typeof lstat>> | undefined;
  try {
    target = await lstat(outputPath);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  if (target !== undefined) {
    if (target.isSymbolicLink() || !target.isFile())
      throw new CliFailure('Unsafe output target: ' + outputPath + '.');
    const source = await stat(templatePath);
    if (source.dev === target.dev && source.ino === target.ino)
      throw new CliFailure('Output path refers to the template file.');
    if (!overwrite)
      throw new CliFailure(
        'Output already exists: ' + outputPath + '. Use --overwrite to replace it.',
      );
  }

  if (!overwrite) {
    await writeFile(outputPath, content, { flag: 'wx' });
    return;
  }

  const temporaryPath = path.join(path.dirname(outputPath), '.templify-inspect-' + randomUUID());
  let temporaryCreated = false;
  let renamed = false;
  try {
    const handle = await open(temporaryPath, 'wx');
    temporaryCreated = true;
    try {
      await handle.writeFile(content);
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, outputPath);
    renamed = true;
  } finally {
    if (temporaryCreated && !renamed) {
      await unlink(temporaryPath).catch((error: unknown) => {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      });
    }
  }
}

function requireStage<T, E, W>(result: StageResult<T, E, W>): T {
  for (const warning of result.warnings) diagnostics.warn(formatDiagnostic(warning));
  if (!result.ok) throw new CliFailure(result.errors.map(formatDiagnostic).join('\n'));
  return result.value;
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = {
    name: 'templify',
    description: 'Fill DOCX templates.',
    version: packageJson.version,
    subCommands: { inspect, generate },
    strict: true,
    renderHeader: async () => '',
    renderValidationErrors: null,
  } as const;
  try {
    await cli(
      args,
      {
        name: 'templify',
        description: 'Fill DOCX templates.',
        run: () => {
          throw new CliFailure('Choose inspect or generate.', 2);
        },
      },
      options,
    );
  } catch (error) {
    if (error instanceof AggregateError) {
      for (const issue of error.errors) {
        diagnostics.error(issue instanceof Error ? issue.message : String(issue));
      }
      await printUsage(args, options);
      process.exitCode = 2;
    } else if (isCommandNotFoundError(error)) {
      diagnostics.error(error.message);
      await printUsage([], options);
      process.exitCode = 2;
    } else if (error instanceof CliFailure) {
      diagnostics.error(error.message);
      if (error.exitCode === 2) await printUsage(args, options);
      process.exitCode = error.exitCode;
    } else {
      diagnostics.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}

async function printUsage(
  args: readonly string[],
  options: Parameters<typeof cli>[2],
): Promise<void> {
  const command = args[0] === 'inspect' || args[0] === 'generate' ? args[0] : undefined;
  const usage = await cli(
    command ? [command, '--help'] : ['--help'],
    { name: 'templify' },
    { ...options, usageSilent: true },
  );
  if (usage) process.stderr.write(`${usage}\n`);
}

await main();
