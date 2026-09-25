import { asRecord, inputPosition, quoted, withCode, type Diagnostic } from './shared';

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
        'Invalid CSV' +
          (typeof diagnostic.sourceRowNumber === 'number'
            ? ' near row ' + diagnostic.sourceRowNumber
            : '') +
          ' (' +
          String(diagnostic.reason) +
          ').',
      );
    case 'MissingCsvHeader':
      return withCode(code, 'CSV is empty or has no header row.');
    case 'EmptyCsvHeader':
      return withCode(code, 'CSV header column ' + String(diagnostic.columnNumber) + ' is empty.');
    case 'InvalidXlsx':
      return withCode(code, 'Invalid XLSX workbook: ' + String(diagnostic.reason) + '.');
    case 'XlsxTemplateFailed':
      return withCode(code, 'Could not create XLSX template: ' + String(diagnostic.reason) + '.');
    case 'MissingXlsxSheet':
      return withCode(
        code,
        'Required XLSX worksheet ' + quoted(diagnostic.sheetName) + ' was not found.',
      );
    case 'MissingXlsxHeader':
      return withCode(
        code,
        'XLSX worksheet ' + quoted(diagnostic.sheetName) + ' has no header row.',
      );
    case 'InvalidXlsxHeader':
      return withCode(
        code,
        'XLSX worksheet ' +
          quoted(diagnostic.sheetName) +
          ' has an empty or non-text header in column ' +
          String(diagnostic.columnNumber) +
          '.',
      );
    case 'DuplicateXlsxHeader':
      return withCode(
        code,
        'Duplicate XLSX header ' +
          quoted(diagnostic.fieldName) +
          ' in worksheet ' +
          quoted(diagnostic.sheetName) +
          '.',
      );
    case 'MissingXlsxField':
      return withCode(
        code,
        'Missing XLSX column ' +
          quoted(diagnostic.fieldName) +
          ' in worksheet ' +
          quoted(diagnostic.sheetName) +
          '.',
      );
    case 'InvalidXlsxCell':
      return withCode(
        code,
        'Invalid XLSX cell at ' +
          quoted(diagnostic.sheetName) +
          ' row ' +
          String(diagnostic.rowNumber) +
          ', column ' +
          String(diagnostic.columnNumber) +
          ' (' +
          String(diagnostic.reason) +
          '). Recalculate and save the workbook if this is a formula.',
      );
    case 'InvalidXlsxRecordId':
      return withCode(
        code,
        'A direct text record ID is required at ' +
          quoted(diagnostic.sheetName) +
          ' row ' +
          String(diagnostic.rowNumber) +
          ', column ' +
          String(diagnostic.columnNumber) +
          '.',
      );
    case 'DuplicateXlsxRecordId':
      return withCode(
        code,
        'Duplicate record ID ' +
          quoted(diagnostic.recordId) +
          ' at ' +
          quoted(diagnostic.sheetName) +
          ' row ' +
          String(diagnostic.rowNumber) +
          '.',
      );
    case 'UnknownXlsxParentId':
      return withCode(
        code,
        'Parent ID ' +
          quoted(diagnostic.parentId) +
          ' at ' +
          quoted(diagnostic.sheetName) +
          ' row ' +
          String(diagnostic.rowNumber) +
          ' does not match a root record.',
      );
    case 'XlsxRootCollectionCollision':
      return withCode(
        code,
        'The root worksheet ' +
          quoted(diagnostic.sheetName) +
          ' is also a collection name. Select another root worksheet with --sheet.',
      );
    case 'InvalidXlsxSheetName':
      return withCode(
        code,
        'Collection ' +
          quoted(diagnostic.fieldName) +
          ' cannot be used as an Excel worksheet name.',
      );
    case 'DuplicateXlsxSheetName':
      return withCode(
        code,
        'Collection names ' + String(diagnostic.fieldNames) + ' collide as Excel worksheet names.',
      );
    case 'ReservedXlsxFieldName':
      return withCode(
        code,
        'Field ' +
          quoted(diagnostic.fieldName) +
          ' in ' +
          quoted(diagnostic.scope) +
          ' conflicts with an XLSX relationship column.',
      );
    case 'ExtraXlsxSheetsIgnored':
      return withCode(
        code,
        'Ignored extra XLSX worksheet(s): ' + String(diagnostic.sheetNames) + '.',
      );
    case 'ExtraXlsxColumnsIgnored':
      return withCode(
        code,
        'Ignored extra XLSX column(s) in ' +
          quoted(diagnostic.sheetName) +
          ': ' +
          String(diagnostic.fieldNames) +
          '.',
      );
    case 'UnsupportedTabularTemplate':
      return withCode(
        code,
        'CSV input and templates do not support collection field ' +
          quoted(diagnostic.fieldName) +
          '.',
      );
    case 'NoTemplateFields':
      return withCode(code, 'The template has no fields to export.');
    case 'NoMatchingInputFields':
      return withCode(
        code,
        'No CSV headers match template fields. Check that the first row contains headers with the exact field names.',
      );
    case 'DuplicateInputField':
      return withCode(
        code,
        'Duplicate CSV header ' +
          quoted(diagnostic.fieldName) +
          ' in columns ' +
          (Array.isArray(diagnostic.columnNumbers)
            ? diagnostic.columnNumbers.join(', ')
            : 'unknown') +
          '.',
      );
    case 'EmptyInputRowsIgnored':
      return withCode(code, 'Ignored ' + String(diagnostic.rowCount) + ' empty input row(s).');
    case 'ExtraInputFieldsIgnored': {
      const names = Array.isArray(diagnostic.fieldNames)
        ? diagnostic.fieldNames.map(quoted).join(', ')
        : 'unknown';
      return withCode(
        code,
        'Ignored input field(s) ' + names + '. Check their spelling against the template fields.',
      );
    }
    case 'MissingInputField': {
      const field = diagnostic.fieldName;
      return typeof field === 'string'
        ? withCode(
            code,
            'Missing template field ' +
              quoted(field) +
              inputPosition(diagnostic) +
              '. Add a matching input column or provide --set ' +
              field +
              '=<value>.',
          )
        : withCode(code, 'A template field is missing from the input.');
    }
    case 'InvalidInputValue': {
      const field = asRecord(diagnostic.location)?.path;
      const name = Array.isArray(field) ? field.join('.') : undefined;
      const reason = diagnostic.reason;
      return withCode(
        code,
        'Invalid value' +
          (name ? ' for ' + quoted(name) : '') +
          inputPosition(diagnostic) +
          ': expected ' +
          String(diagnostic.expected) +
          (reason ? ' (' + String(reason) + ')' : '') +
          '.',
      );
    }
    case 'NoInputRecords':
      return withCode(code, 'No input records were provided.');
    default:
      return undefined;
  }
}
