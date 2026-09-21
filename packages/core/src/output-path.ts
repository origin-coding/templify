import path from 'node:path';

import filenameReservedRegex, { windowsReservedNameRegex } from 'filename-reserved-regex';

import type { DocumentOutputErrorReason } from './errors.js';

export const MAX_FILENAME_UTF16_CODE_UNITS = 255;

export function validateWindowsFilenameSegment(
  segment: string,
): DocumentOutputErrorReason | undefined {
  if (segment.length === 0) return 'EmptyFilename';
  if (segment === '.' || segment === '..') return 'DotFilename';
  if (windowsReservedNameRegex().test(segment)) return 'ReservedDeviceName';
  if (/[. ]$/u.test(segment)) return 'TrailingDotOrSpace';
  if (filenameReservedRegex().test(segment)) return 'InvalidCharacter';
  if (segment.length > MAX_FILENAME_UTF16_CODE_UNITS) return 'FilenameTooLong';
  return undefined;
}

export function isPathContained(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return !(
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}
