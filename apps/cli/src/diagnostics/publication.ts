import { quoted, withCode, type Diagnostic } from './shared';

export function formatPublicationDiagnostic(
  diagnostic: Diagnostic,
  code: string,
): string | undefined {
  if (code === 'OutputConflict') {
    return withCode(
      code,
      `Output already exists at ${quoted(diagnostic.path)}. Use --overwrite to replace it.`,
    );
  }
  return undefined;
}
