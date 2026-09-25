import { createConsola } from 'consola/basic';
import type { StageResult } from '@templify/core';
import { formatDiagnostic } from './diagnostics/format-diagnostic';

export const diagnostics = createConsola({ stdout: process.stderr, stderr: process.stderr });

export class CliFailure extends Error {
  readonly exitCode: 1 | 2;

  constructor(message: string, exitCode: 1 | 2 = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function requireStage<T, E, W>(result: StageResult<T, E, W>): T {
  for (const warning of result.warnings) diagnostics.warn(formatDiagnostic(warning));
  if (!result.ok) throw new CliFailure(result.errors.map(formatDiagnostic).join('\n'));
  return result.value;
}
