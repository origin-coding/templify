import path from 'node:path';

export function resolveInsideRoot(root: string, relativePath: string): string | undefined {
  if (!path.isAbsolute(root) || path.isAbsolute(relativePath)) return undefined;
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(normalizedRoot, ...relativePath.split('/'));
  const relative = path.relative(normalizedRoot, target);
  return relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
    ? target
    : undefined;
}

export function comparisonKey(value: string): string {
  return process.platform === 'win32'
    ? path.resolve(value).toLocaleLowerCase('en-US')
    : path.resolve(value);
}
