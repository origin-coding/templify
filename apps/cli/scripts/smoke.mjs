import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, rm, writeFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDocx } from '../../../packages/core/tests/docx-fixture.ts';

const cliRoot = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'templify-cli-smoke-'));

function run(program, args, cwd = cliRoot, expectedStatus = 0) {
  const command =
    process.platform === 'win32' && program !== process.execPath ? `${program}.cmd` : program;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && program !== process.execPath,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    expectedStatus,
    `${program} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

try {
  const entry = path.join(cliRoot, 'dist', 'index.js');
  const built = await readFile(entry, 'utf8');
  assert.ok(built.startsWith('#!/usr/bin/env node\n'));
  assert.doesNotMatch(built, /(?:from\s*|require\()['"]@templify\//u);

  run('pnpm', ['pack', '--pack-destination', temp]);
  const tarball = (await readdir(temp)).find((name) => name.endsWith('.tgz'));
  assert.ok(tarball);

  const install = path.join(temp, 'installed');
  await mkdir(install);
  run('npm', [
    'install',
    '--prefix',
    install,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    path.join(temp, tarball),
  ]);
  const bin = path.join(install, 'node_modules', '@templify', 'cli', 'dist', 'index.js');
  const template = path.join(temp, 'template.docx');
  await writeFile(template, createDocx([['Hello {name}!']]));

  assert.match(run(process.execPath, [bin, '--help']).stdout, /inspect/u);
  const tableTemplate = path.join(temp, 'table-template.docx');
  await writeFile(tableTemplate, createDocx([['{名字:string} {部门:option["研发","Sales"]}']]));
  const tableOutput = run(process.execPath, [bin, 'inspect', tableTemplate]);
  assert.match(tableOutput.stdout, /FIELD.*TYPE.*OPTIONS/u);
  assert.match(tableOutput.stdout, /名字.*string/u);
  assert.match(tableOutput.stdout, /部门.*option.*研发, Sales/u);
  assert.equal(tableOutput.stderr, '');
  const inspected = run(process.execPath, [bin, 'inspect', template, '--format', 'json']);
  assert.deepEqual(
    JSON.parse(inspected.stdout).fields.map((field) => field.name),
    ['name'],
  );

  const inspectionPath = path.join(temp, 'fields.json');
  run(process.execPath, [bin, 'inspect', template, '--format', 'json', '--output', inspectionPath]);
  const inspection = await readFile(inspectionPath, 'utf8');
  const conflict = run(
    process.execPath,
    [bin, 'inspect', template, '--format', 'json', '--output', inspectionPath],
    cliRoot,
    1,
  );
  assert.equal(conflict.stdout, '');
  assert.match(conflict.stderr, /Output already exists/u);
  run(process.execPath, [
    bin,
    'inspect',
    template,
    '--format',
    'json',
    '--output',
    inspectionPath,
    '--overwrite',
  ]);
  assert.equal(await readFile(inspectionPath, 'utf8'), inspection);

  const templateLink = path.join(temp, 'template-link.docx');
  await link(template, templateLink);
  run(
    process.execPath,
    [bin, 'inspect', template, '--format', 'json', '--output', templateLink, '--overwrite'],
    cliRoot,
    1,
  );
  const missingFieldTemplate = path.join(temp, 'missing-field.docx');
  await writeFile(missingFieldTemplate, createDocx([['{name} {age:number} {你好}']]));
  const missingField = run(
    process.execPath,
    [
      bin,
      'generate',
      missingFieldTemplate,
      '--set',
      'name=孙强',
      '--set',
      'agea=25',
      '--set',
      '你好=c你好',
      '--output-file',
      path.join(temp, 'missing-field-output.docx'),
    ],
    cliRoot,
    1,
  );
  assert.equal(missingField.stdout, '');
  assert.match(missingField.stderr, /Ignored input field\(s\) "agea"/u);
  assert.match(missingField.stderr, /Missing template field "age"/u);
  assert.match(missingField.stderr, /--set age=<value>/u);
  assert.doesNotMatch(missingField.stderr, /\{"stage":/u);

  const output = path.join(temp, 'output.docx');
  assert.match(
    run(process.execPath, [
      bin,
      'generate',
      template,
      '--set',
      'name=Alice',
      '--output-file',
      output,
      '--dry-run',
    ]).stdout,
    /create/u,
  );
  run(process.execPath, [
    bin,
    'generate',
    template,
    '--set',
    'name=Alice',
    '--output-file',
    output,
  ]);
  assert.equal(
    run(process.execPath, [bin, 'inspect', output, '--format', 'json']).stdout.includes('"name"'),
    false,
  );
  run(
    process.execPath,
    [bin, 'generate', template, '--set', 'name=Alice', '--output-file', output],
    cliRoot,
    1,
  );
  run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--set',
      'name=Alice',
      '--set',
      'name=Bob',
      '--output-file',
      output,
    ],
    cliRoot,
    2,
  );

  process.stdout.write('CLI isolated-install smoke test passed.\n');
} finally {
  const parent = path.resolve(tmpdir()) + path.sep;
  if (
    path.resolve(temp).startsWith(parent) &&
    path.basename(temp).startsWith('templify-cli-smoke-')
  ) {
    await rm(temp, { recursive: true, force: true });
  }
}
