import { asRecord, csvPosition, quoted, withCode, type Diagnostic } from './shared';

export function formatInputDiagnostic(diagnostic: Diagnostic, code: string): string | undefined {
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
      return typeof field === 'string'
        ? withCode(
            code,
            `Missing template field ${quoted(field)}${csvPosition(diagnostic)}. Add a matching CSV column or provide --set ${field}=<value>.`,
          )
        : withCode(code, 'A template field is missing from the input.');
    }
    case 'InvalidInputValue': {
      const field = asRecord(diagnostic.location)?.path;
      const name = Array.isArray(field) ? field.join('.') : undefined;
      const reason = diagnostic.reason;
      return withCode(
        code,
        `Invalid value${name ? ` for ${quoted(name)}` : ''}${csvPosition(diagnostic)}: expected ${String(diagnostic.expected)}${reason ? ` (${String(reason)})` : ''}.`,
      );
    }
    case 'NoInputRecords':
      return withCode(code, 'No input records were provided.');
    default:
      return undefined;
  }
}
