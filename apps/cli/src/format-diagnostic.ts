function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function quoted(value: unknown): string {
  return JSON.stringify(String(value));
}

function withCode(code: string, message: string): string {
  return `${message} [${code}]`;
}

export function formatDiagnostic(value: unknown): string {
  const diagnostic = asRecord(value);
  if (!diagnostic) return String(value);
  if ('issue' in diagnostic) return formatDiagnostic(diagnostic.issue);

  const code = diagnostic.code;
  if (typeof code !== 'string') return 'An operation failed without a diagnostic code.';

  switch (code) {
    case 'ExtraInputFieldsIgnored': {
      const names = Array.isArray(diagnostic.fieldNames)
        ? diagnostic.fieldNames.map(quoted).join(', ')
        : 'unknown';
      return withCode(
        code,
        `Ignored input field(s) ${names}. Check their spelling against the template fields.`,
      );
    }
    case 'MissingInputField': {
      const field = diagnostic.fieldName;
      if (typeof field === 'string')
        return withCode(
          code,
          `Missing template field ${quoted(field)}. Provide it with --set ${field}=<value>.`,
        );
      return withCode(code, 'A template field is missing from the input.');
    }
    case 'InvalidInputValue': {
      const field = asRecord(diagnostic.location)?.path;
      const name = Array.isArray(field) ? field.join('.') : undefined;
      const expected = diagnostic.expected;
      const reason = diagnostic.reason;
      return withCode(
        code,
        `Invalid value${name ? ` for ${quoted(name)}` : ''}: expected ${String(expected)}${reason ? ` (${String(reason)})` : ''}.`,
      );
    }
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
    case 'NoInputRecords':
      return withCode(code, 'No input records were provided.');
    case 'OutputConflict':
      return withCode(
        code,
        `Output already exists at ${quoted(diagnostic.path)}. Use --overwrite to replace it.`,
      );
    case 'InvalidArtifactPath':
      return withCode(
        code,
        `Invalid output path ${quoted(diagnostic.path)} (${String(diagnostic.reason)}).`,
      );
    default: {
      const details = Object.entries(diagnostic)
        .filter(([key, item]) => key !== 'code' && (typeof item !== 'object' || item === null))
        .map(([key, item]) => `${key}: ${String(item)}`)
        .join(', ');
      return withCode(code, details || 'The operation could not be completed.');
    }
  }
}
