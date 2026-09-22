/* eslint-disable no-await-in-loop -- The build script rewrites a small deterministic file set in order. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRootArgument = process.argv[2];
if (outputRootArgument === undefined) {
  throw new TypeError('Expected a declaration output directory.');
}

const outputRoot = path.resolve(outputRootArgument);
for (const filePath of await collectDeclarationFiles(outputRoot)) {
  const source = await readFile(filePath, 'utf8');
  const rewritten = source.replaceAll(/(['"])@\/([^'"]+)\1/gu, (_match, quote, target) => {
    const resolvedTarget = path.resolve(outputRoot, target);
    const relativeToRoot = path.relative(outputRoot, resolvedTarget);
    if (relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
      throw new TypeError(`Declaration alias escapes the output root: ${target}`);
    }
    const relative = path
      .relative(path.dirname(filePath), resolvedTarget)
      .replaceAll(path.sep, '/');
    const specifier = relative.startsWith('.') ? relative : `./${relative}`;
    return `${quote}${specifier}${quote}`;
  });
  if (rewritten !== source) await writeFile(filePath, rewritten, 'utf8');
}

async function collectDeclarationFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectDeclarationFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith('.d.ts')) files.push(entryPath);
  }
  return files;
}
