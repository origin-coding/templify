import { quoted, withCode, type Diagnostic } from './shared';

export function formatTemplateDiagnostic(diagnostic: Diagnostic, code: string): string | undefined {
  switch (code) {
    case 'InvalidTemplate':
      return withCode(
        code,
        `The DOCX template is invalid or could not be compiled (${String(diagnostic.reason)}).`,
      );
    case 'InvalidTemplateTag': {
      const hint =
        diagnostic.reason === 'InvalidOptionHint'
          ? ' Use option["A","B"] with straight quotation marks.'
          : '';
      return withCode(
        code,
        `Invalid template tag ${quoted(diagnostic.rawTag)} (${String(diagnostic.reason)}).${hint}`,
      );
    }
    case 'ConflictingFieldDefinition':
      return withCode(
        code,
        `Conflicting definitions for template field ${quoted(diagnostic.fieldName)}.`,
      );
    case 'UnsupportedTemplateTag':
      return withCode(
        code,
        `Unsupported template tag ${quoted(diagnostic.rawTag)} (${String(diagnostic.reason)}).`,
      );
    default:
      return undefined;
  }
}
