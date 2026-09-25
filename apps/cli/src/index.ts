#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
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
  publishStandaloneFile,
} from '@templify/node-output';
import {
  createCsvTemplate,
  parseCsvInput,
  validateScalarTabularTemplate,
} from '@templify/tabular-input';
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
      choices: ['table', 'json', 'csv-template'],
      default: 'table',
      description: 'Output format',
    },
    output: { type: 'string', description: 'Write the result to this file' },
    overwrite: { type: 'boolean', description: 'Replace an existing output file' },
  },
  async run(ctx) {
    const templatePath = path.resolve(ctx.values.template);
    if (ctx.values.format === 'csv-template' && !ctx.values.output)
      throw new CliFailure('--format csv-template requires --output.', 2);
    if (ctx.values.overwrite && !ctx.values.output)
      throw new CliFailure('--overwrite requires --output.', 2);
    const definition = await inspectTemplate(templatePath);
    const bytes =
      ctx.values.format === 'csv-template'
        ? requireStage(createCsvTemplate(definition))
        : new TextEncoder().encode(
            ctx.values.format === 'json'
              ? JSON.stringify(definition, null, 2) + '\n'
              : renderFieldTable(definition),
          );
    if (ctx.values.output) {
      requireStage(
        await publishStandaloneFile({
          outputPath: path.resolve(ctx.values.output),
          bytes,
          conflictPolicy: ctx.values.overwrite ? 'overwrite' : 'error',
          protectedPaths: [templatePath],
        }),
      );
    } else {
      process.stdout.write(new TextDecoder().decode(bytes));
    }
  },
});

const generate = define({
  name: 'generate',
  description: 'Generate DOCX documents from manual values or CSV records.',
  args: {
    template: { type: 'positional', description: 'DOCX template path' },
    set: { type: 'string', multiple: true, description: 'Field value (repeat: --set field=value)' },
    input: { type: 'string', description: 'CSV input file' },
    inputEncoding: {
      type: 'enum',
      choices: ['utf8', 'gbk'],
      toKebab: true,
      description: 'CSV encoding (default: utf8)',
    },
    outputFile: { type: 'string', toKebab: true, description: 'Single output DOCX path' },
    outputDir: {
      type: 'string',
      toKebab: true,
      description: 'Directory for individual DOCX files',
    },
    pathTemplate: {
      type: 'string',
      toKebab: true,
      description: 'Relative document path for directory output',
    },
    overwrite: { type: 'boolean', description: 'Replace existing output files' },
    dryRun: {
      type: 'boolean',
      toKebab: true,
      description: 'Validate and show publication actions without writing',
    },
  },
  async run(ctx) {
    const templatePath = path.resolve(ctx.values.template);
    const inputPath = ctx.values.input ? path.resolve(ctx.values.input) : undefined;
    const outputFile = ctx.values.outputFile;
    const outputDir = ctx.values.outputDir;
    if (Boolean(outputFile) === Boolean(outputDir))
      throw new CliFailure('Choose exactly one of --output-file or --output-dir.', 2);
    if (inputPath && (ctx.values.set?.length ?? 0) > 0)
      throw new CliFailure('--input and --set cannot be combined.', 2);
    if (ctx.values.inputEncoding && !inputPath)
      throw new CliFailure('--input-encoding requires --input.', 2);
    if (ctx.values.pathTemplate && !outputDir)
      throw new CliFailure('--path-template requires --output-dir.', 2);
    if (inputPath && path.extname(inputPath).toLocaleLowerCase('en-US') !== '.csv')
      throw new CliFailure('Only .csv input is supported by this command.', 2);

    const source = await readFile(templatePath);
    const prepared = requireStage(prepareTemplate(source));
    if (inputPath) requireStage(validateScalarTabularTemplate(prepared.definition));
    const input = inputPath
      ? requireStage(
          parseCsvInput(await readFile(inputPath), {
            encoding: ctx.values.inputEncoding === 'gbk' ? 'gbk' : 'utf8',
          }),
        )
      : { kind: 'object-rows' as const, rows: [parseSetValues(ctx.values.set ?? [])] };

    const outputPath = outputFile ? path.resolve(outputFile) : undefined;
    const naming = outputPath
      ? { kind: 'single' as const, fileName: path.basename(outputPath) }
      : {
          kind: 'template' as const,
          pathTemplate: normalizeDocxPathTemplate(
            ctx.values.pathTemplate ?? 'document-{$index}.docx',
          ),
        };
    const generation = requireStage(
      prepareGeneration({
        template: prepared,
        input,
        request: { naming, documentOutputs: 'docx' },
      }),
    );
    const publicationPlan = requireStage(
      createPublicationPlan({
        manifest: derivePublicationManifest(generation.plan),
        rootDirectory: outputPath ? path.dirname(outputPath) : path.resolve(outputDir!),
        conflictPolicy: ctx.values.overwrite ? 'overwrite' : 'error',
        protectedPaths: inputPath ? [templatePath, inputPath] : [templatePath],
      }),
    );
    const preflighted = requireStage(await preflightPublication(publicationPlan));
    if (ctx.values.dryRun) {
      for (const item of preflighted.items) {
        process.stdout.write(item.action + '\t' + item.destinationPath + '\n');
      }
      return;
    }
    const generated = requireStage(await generateArtifacts(generation));
    const packaged = requireStage(packageArtifacts(generation.plan, generated));
    const published = requireStage(await publishArtifacts(preflighted, packaged));
    for (const artifact of published.artifacts) process.stdout.write(artifact.path + '\n');
  },
});

function normalizeDocxPathTemplate(value: string): string {
  const extension = path.posix.extname(value);
  if (extension.length === 0) return value + '.docx';
  if (extension.toLocaleLowerCase('en-US') !== '.docx')
    throw new CliFailure('--path-template must name a .docx file.', 2);
  return value;
}

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
