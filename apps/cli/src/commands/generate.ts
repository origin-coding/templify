import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { define } from 'gunshi';
import {
  derivePublicationManifest,
  generateArtifacts,
  packageArtifacts,
  prepareGeneration,
  prepareTemplate,
} from '@templify/core';
import {
  createPublicationPlan,
  preflightPublication,
  publishArtifacts,
} from '@templify/node-output';
import {
  detectInputFileFormat,
  parseCsvInput,
  parseXlsxInput,
  validateScalarTabularTemplate,
} from '@templify/tabular-input';
import { CliFailure, requireStage } from '../cli-runtime';

export const generate = define({
  name: 'generate',
  description: 'Generate DOCX documents from manual values, CSV, or XLSX records.',
  args: {
    template: { type: 'positional', description: 'DOCX template path' },
    set: { type: 'string', multiple: true, description: 'Field value (repeat: --set field=value)' },
    input: { type: 'string', description: 'CSV or XLSX input file', conflicts: 'set' },
    sheet: { type: 'string', description: 'Root worksheet name for XLSX input' },
    inputEncoding: {
      type: 'enum',
      choices: ['utf8', 'gbk'],
      toKebab: true,
      description: 'CSV encoding (default: utf8)',
    },
    outputFile: {
      type: 'string',
      toKebab: true,
      description: 'Single output DOCX path',
      conflicts: ['outputDir', 'outputZip'],
    },
    outputDir: {
      type: 'string',
      toKebab: true,
      description: 'Directory for individual DOCX files',
      conflicts: 'outputZip',
    },
    outputZip: { type: 'string', toKebab: true, description: 'ZIP archive output path' },
    pathTemplate: {
      type: 'string',
      toKebab: true,
      description: 'Relative document path for directory or ZIP output',
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
    const { outputFile, outputDir, outputZip } = ctx.values;
    if (!outputFile && !outputDir && !outputZip)
      throw new CliFailure('Choose one of --output-file, --output-dir, or --output-zip.', 2);
    if (ctx.values.inputEncoding && !inputPath)
      throw new CliFailure('--input-encoding requires --input.', 2);
    if (ctx.values.sheet !== undefined && !inputPath)
      throw new CliFailure('--sheet requires --input.', 2);
    if (ctx.values.pathTemplate && !outputDir && !outputZip)
      throw new CliFailure('--path-template requires --output-dir or --output-zip.', 2);
    const detected = inputPath ? detectInputFileFormat(inputPath) : undefined;
    if (detected?.kind === 'unsupported-excel')
      throw new CliFailure(
        'Only .xlsx Excel files are supported; convert ' + detected.extension + ' to .xlsx.',
        2,
      );
    if (detected?.kind === 'unknown')
      throw new CliFailure(
        'Unsupported input file extension ' +
          JSON.stringify(detected.extension) +
          '; use .csv or .xlsx.',
        2,
      );
    const inputFormat = detected?.kind === 'supported' ? detected.format : undefined;
    if (ctx.values.sheet !== undefined && inputFormat !== 'xlsx')
      throw new CliFailure('--sheet requires .xlsx input.', 2);
    if (ctx.values.inputEncoding && inputFormat !== 'csv')
      throw new CliFailure('--input-encoding requires .csv input.', 2);

    const prepared = requireStage(prepareTemplate(await readFile(templatePath)));
    if (inputFormat === 'csv') requireStage(validateScalarTabularTemplate(prepared.definition));
    const input = inputPath
      ? inputFormat === 'csv'
        ? requireStage(
            parseCsvInput(await readFile(inputPath), {
              encoding: ctx.values.inputEncoding === 'gbk' ? 'gbk' : 'utf8',
            }),
          )
        : requireStage(
            await parseXlsxInput(await readFile(inputPath), prepared.definition, {
              ...(ctx.values.sheet === undefined ? {} : { sheet: ctx.values.sheet }),
            }),
          )
      : { kind: 'object-rows' as const, rows: [parseSetValues(ctx.values.set ?? [])] };

    const outputPath = outputFile
      ? path.resolve(outputFile)
      : outputZip
        ? path.resolve(outputZip)
        : undefined;
    const naming = outputFile
      ? { kind: 'single' as const, fileName: path.basename(outputFile) }
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
        request: {
          naming,
          documentOutputs: 'docx',
          ...(outputZip
            ? { bundle: { kind: 'zip' as const, fileName: path.basename(outputZip) } }
            : {}),
        },
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
