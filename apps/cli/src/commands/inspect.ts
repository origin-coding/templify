import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { define } from 'gunshi';
import { getBorderCharacters, table } from 'table';
import { prepareTemplate, type TemplateDefinition } from '@templify/core';
import { publishStandaloneFile } from '@templify/node-output';
import { createCsvTemplate, createXlsxTemplate } from '@templify/tabular-input';
import { CliFailure, requireStage } from '../cli-runtime';

export const inspect = define({
  name: 'inspect',
  description: 'Inspect fields in a DOCX template.',
  args: {
    template: { type: 'positional', description: 'DOCX template path' },
    format: {
      type: 'enum',
      choices: ['table', 'json', 'csv-template', 'excel-template'],
      default: 'table',
      description: 'Output format',
    },
    output: { type: 'string', description: 'Write the result to this file' },
    overwrite: { type: 'boolean', description: 'Replace an existing output file' },
  },
  async run(ctx) {
    const templatePath = path.resolve(ctx.values.template);
    if (
      (ctx.values.format === 'csv-template' || ctx.values.format === 'excel-template') &&
      !ctx.values.output
    )
      throw new CliFailure('--format ' + ctx.values.format + ' requires --output.', 2);
    if (ctx.values.output) {
      const expectedExtension = {
        table: undefined,
        json: '.json',
        'csv-template': '.csv',
        'excel-template': '.xlsx',
      }[ctx.values.format];
      if (
        expectedExtension &&
        path.extname(ctx.values.output).toLocaleLowerCase('en-US') !== expectedExtension
      )
        throw new CliFailure(
          '--format ' + ctx.values.format + ' requires a ' + expectedExtension + ' output path.',
          2,
        );
    }
    if (ctx.values.overwrite && !ctx.values.output)
      throw new CliFailure('--overwrite requires --output.', 2);
    const definition = requireStage(prepareTemplate(await readFile(templatePath))).definition;
    const bytes =
      ctx.values.format === 'csv-template'
        ? requireStage(createCsvTemplate(definition))
        : ctx.values.format === 'excel-template'
          ? requireStage(await createXlsxTemplate(definition))
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
