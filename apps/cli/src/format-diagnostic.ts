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

  const location = asRecord(diagnostic.location);
  const row = typeof location?.sourceRowNumber === 'number' ? location.sourceRowNumber : undefined;
  const column =
    typeof location?.sourceColumnNumber === 'number' ? location.sourceColumnNumber : undefined;
  const position =
    row === undefined
      ? ''
      : ` at CSV row ${row}${column === undefined ? '' : `, column ${column}`}`;
  switch (code) {
    case 'InvalidCsvEncoding':
      return withCode(
        code,
        diagnostic.encoding === 'utf8'
          ? 'CSV is not valid UTF-8. If it is encoded as GBK, use --input-encoding gbk.'
          : 'CSV could not be decoded as GBK.',
      );
    case 'InvalidCsv':
      return withCode(
        code,
        `Invalid CSV${typeof diagnostic.sourceRowNumber === 'number' ? ` near row ${diagnostic.sourceRowNumber}` : ''} (${String(diagnostic.reason)}).`,
      );
    case 'MissingCsvHeader':
      return withCode(code, 'CSV is empty or has no header row.');
    case 'EmptyCsvHeader':
      return withCode(code, `CSV header column ${String(diagnostic.columnNumber)} is empty.`);
    case 'UnsupportedTabularTemplate':
      return withCode(
        code,
        `CSV input and templates do not support collection field ${quoted(diagnostic.fieldName)}.`,
      );
    case 'NoTemplateFields':
      return withCode(code, 'The template has no fields to export as CSV headers.');
    case 'NoMatchingInputFields':
      return withCode(
        code,
        'No CSV headers match template fields. Check that the first row contains headers with the exact field names.',
      );
    case 'DuplicateInputField':
      return withCode(
        code,
        `Duplicate CSV header ${quoted(diagnostic.fieldName)} in columns ${Array.isArray(diagnostic.columnNumbers) ? diagnostic.columnNumbers.join(', ') : 'unknown'}.`,
      );
    case 'EmptyInputRowsIgnored':
      return withCode(code, `Ignored ${String(diagnostic.rowCount)} empty input row(s).`);
    case 'InvalidRecordCount':
      return withCode(code, 'Single-file output requires exactly one nonempty record.');
    case 'DuplicateArtifactPath':
      return withCode(
        code,
        `Multiple records resolve to ${quoted(diagnostic.path)}. Include '{$index}' in --path-template to make names unique.`,
      );
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
          `Missing template field ${quoted(field)}${position}. Add a matching CSV column or provide --set ${field}=<value>.`,
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
        `Invalid value${name ? ` for ${quoted(name)}` : ''}${position}: expected ${String(expected)}${reason ? ` (${String(reason)})` : ''}.`,
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
