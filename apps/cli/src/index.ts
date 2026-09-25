#!/usr/bin/env node
import { cli, isCommandNotFoundError } from 'gunshi';
import packageJson from '../package.json' with { type: 'json' };
import { CliFailure, diagnostics } from './cli-runtime';
import { generate } from './commands/generate';
import { inspect } from './commands/inspect';

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
