import { formatGenerationDiagnostic } from './generation';
import { formatInputDiagnostic } from './input';
import { formatPublicationDiagnostic } from './publication';
import { asRecord, withCode } from './shared';
import { formatTemplateDiagnostic } from './template';

export function formatDiagnostic(value: unknown): string {
  const diagnostic = asRecord(value);
  if (!diagnostic) return String(value);
  if ('issue' in diagnostic) return formatDiagnostic(diagnostic.issue);

  const code = diagnostic.code;
  if (typeof code !== 'string') return 'An operation failed without a diagnostic code.';
  const formatted =
    formatInputDiagnostic(diagnostic, code) ??
    formatTemplateDiagnostic(diagnostic, code) ??
    formatGenerationDiagnostic(diagnostic, code) ??
    formatPublicationDiagnostic(diagnostic, code);
  if (formatted !== undefined) return formatted;
  const details = Object.entries(diagnostic)
    .filter(([key, item]) => key !== 'code' && (typeof item !== 'object' || item === null))
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(', ');
  return withCode(code, details || 'The operation could not be completed.');
}
