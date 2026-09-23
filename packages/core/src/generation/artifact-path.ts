import path from 'node:path';

import filenameReservedRegex, { windowsReservedNameRegex } from 'filename-reserved-regex';

import type { ArtifactPathErrorReason } from './generation-diagnostics';

export const MAX_FILENAME_UTF16_CODE_UNITS = 255;

export function validateArtifactRelativePath(
  relativePath: string,
  extension: '.docx' | '.pdf',
): ArtifactPathErrorReason | undefined {
  if (relativePath.length === 0) return 'EmptyPath';
  if (
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    path.win32.isAbsolute(relativePath)
  ) {
    return 'AbsolutePath';
  }
  const segments = relativePath.split('/');
  for (const segment of segments) {
    const reason = validateArtifactPathSegment(segment);
    if (reason !== undefined) return reason;
  }
  return path.win32.extname(segments.at(-1)!).toLocaleLowerCase('en-US') === extension
    ? undefined
    : 'UnsupportedExtension';
}

export function validateStandaloneArtifactFileName(
  fileName: string,
  extension: '.zip',
): ArtifactPathErrorReason | undefined {
  if (fileName.includes('/') || fileName.includes('\\') || path.win32.isAbsolute(fileName)) {
    return 'AbsolutePath';
  }
  return (
    validateArtifactPathSegment(fileName) ??
    (path.win32.extname(fileName).toLocaleLowerCase('en-US') === extension
      ? undefined
      : 'UnsupportedExtension')
  );
}

export function validateArtifactPathSegment(segment: string): ArtifactPathErrorReason | undefined {
  if (segment.length === 0) return 'EmptySegment';
  if (segment === '.' || segment === '..') return 'DotSegment';
  if (windowsReservedNameRegex().test(segment)) return 'ReservedDeviceName';
  if (/[. ]$/u.test(segment)) return 'TrailingDotOrSpace';
  if (filenameReservedRegex().test(segment)) return 'InvalidCharacter';
  if (segment.length > MAX_FILENAME_UTF16_CODE_UNITS) return 'FilenameTooLong';
  return undefined;
}

export function artifactPathComparisonKey(relativePath: string): string {
  return relativePath.toLocaleLowerCase('en-US');
}
