import { quoted, withCode, type Diagnostic } from './shared';

export function formatGenerationDiagnostic(
  diagnostic: Diagnostic,
  code: string,
): string | undefined {
  switch (code) {
    case 'InvalidRecordCount':
      return withCode(code, 'Single-file output requires exactly one nonempty record.');
    case 'DuplicateArtifactPath':
      return withCode(
        code,
        `Multiple records resolve to ${quoted(diagnostic.path)}. Include '{$index}' in --path-template to make names unique.`,
      );
    case 'InvalidArtifactPath':
      return withCode(
        code,
        `Invalid output path ${quoted(diagnostic.path)} (${String(diagnostic.reason)}).`,
      );
    default:
      return undefined;
  }
}
