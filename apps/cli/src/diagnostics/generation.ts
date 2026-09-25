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
    case 'PdfConverterUnavailable':
      return withCode(
        code,
        `PDF converter ${quoted(diagnostic.converterId)} is unavailable (${String(diagnostic.reason)}).`,
      );
    case 'PdfConversionFailed':
      return withCode(
        code,
        `Could not convert record ${Number(diagnostic.recordIndex) + 1} to PDF at ${quoted(diagnostic.relativePath)} (${String(diagnostic.reason)}).`,
      );
    case 'PdfMergeFailed':
      return withCode(
        code,
        `Could not merge PDF at ${quoted(diagnostic.relativePath)} (${String(diagnostic.reason)}).`,
      );
    case 'PdfConversionLoss':
      return withCode(
        code,
        `Record ${Number(diagnostic.recordIndex) + 1} PDF conversion ${String(diagnostic.severity)} ${quoted(diagnostic.feature)}${diagnostic.where ? ` at ${quoted(diagnostic.where)}` : ''}: ${String(diagnostic.detail)}`,
      );
    default:
      return undefined;
  }
}
