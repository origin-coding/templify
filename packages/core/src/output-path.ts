import path from 'node:path';

import type { DocumentOutputErrorReason } from './errors.js';

const INVALID_WINDOWS_FILENAME_CHARACTER = /[<>:"/\\|?*]/u;
const RESERVED_WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export const MAX_FILENAME_UTF16_CODE_UNITS = 255;

export function validateWindowsFilenameSegment(
  segment: string,
): DocumentOutputErrorReason | undefined {
  if (segment.length === 0) return 'EmptyFilename';
  if (segment === '.' || segment === '..') return 'DotFilename';
  if (
    INVALID_WINDOWS_FILENAME_CHARACTER.test(segment) ||
    [...segment].some((character) => character.codePointAt(0)! <= 0x1f)
  ) {
    return 'InvalidCharacter';
  }
  if (/[. ]$/u.test(segment)) return 'TrailingDotOrSpace';
  if (RESERVED_WINDOWS_DEVICE_NAME.test(segment)) return 'ReservedDeviceName';
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
