import { t } from './i18n';
import { zh, type MessageKey } from '../../shared/messages';
import type { DesktopIssue } from '../../shared/desktop-api';
export function issueLocation(issue: DesktopIssue) {
  const data = issue.data ?? {};
  const loc = (data.location ?? (data.fieldPath ? { path: data.fieldPath } : data)) as Record<
    string,
    unknown
  >;
  const path = Array.isArray(loc.path)
    ? loc.path.join(' / ')
    : (loc.path ?? data.fieldName ?? data.relativePath ?? data.resultingPath);
  return [
    loc.sheetName,
    (loc.sourceRowNumber ?? loc.rowNumber)
      ? t('sourceRow', { row: String(loc.sourceRowNumber ?? loc.rowNumber) })
      : '',
    (loc.sourceColumnNumber ?? loc.columnNumber)
      ? t('sourceColumn', { column: String(loc.sourceColumnNumber ?? loc.columnNumber) })
      : '',
    typeof (loc.inputRowIndex ?? data.recordIndex) === 'number'
      ? t('record', { index: Number(loc.inputRowIndex ?? data.recordIndex) + 1 })
      : '',
    path,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function issueMessage(issue: DesktopIssue): string {
  return t(Object.hasOwn(zh, issue.code) ? (issue.code as MessageKey) : 'unexpected');
}
