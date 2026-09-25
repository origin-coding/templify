export type Diagnostic = Record<string, unknown>;

export function asRecord(value: unknown): Diagnostic | undefined {
  return typeof value === 'object' && value !== null ? (value as Diagnostic) : undefined;
}

export function quoted(value: unknown): string {
  return JSON.stringify(String(value));
}

export function withCode(code: string, message: string): string {
  return `${message} [${code}]`;
}

export function csvPosition(diagnostic: Diagnostic): string {
  const location = asRecord(diagnostic.location);
  const row = typeof location?.sourceRowNumber === 'number' ? location.sourceRowNumber : undefined;
  const column =
    typeof location?.sourceColumnNumber === 'number' ? location.sourceColumnNumber : undefined;
  return row === undefined
    ? ''
    : ` at CSV row ${row}${column === undefined ? '' : `, column ${column}`}`;
}
