import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, rm, writeFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDocx } from '../../../packages/core/tests/docx-fixture.ts';

const cliRoot = fileURLToPath(new URL('..', import.meta.url));
const requireCore = createRequire(
  fileURLToPath(new URL('../../../packages/core/package.json', import.meta.url)),
);
const PizZip = requireCore('pizzip');
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

  const csvTemplate = path.join(temp, 'records-template.csv');
  run(process.execPath, [
    bin,
    'inspect',
    template,
    '--format',
    'csv-template',
    '--output',
    csvTemplate,
  ]);
  assert.deepEqual([...(await readFile(csvTemplate)).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(await readFile(csvTemplate, 'utf8'), '\uFEFFname\r\n');

  const csvInput = path.join(temp, 'records.csv');
  await writeFile(csvInput, '\uFEFFname\r\nAlice\r\nBob\r\n');
  const outputDir = path.join(temp, 'batch');
  const dryRun = run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    csvInput,
    '--output-dir',
    outputDir,
    '--dry-run',
  ]);
  assert.match(dryRun.stdout, /document-1\.docx/u);
  assert.match(dryRun.stdout, /document-2\.docx/u);
  run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    csvInput,
    '--output-dir',
    outputDir,
  ]);
  assert.deepEqual((await readdir(outputDir)).sort(), ['document-1.docx', 'document-2.docx']);
  run(
    process.execPath,
    [bin, 'generate', template, '--input', csvInput, '--output-dir', outputDir],
    cliRoot,
    1,
  );
  run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    csvInput,
    '--output-dir',
    outputDir,
    '--overwrite',
  ]);

  const namedDir = path.join(temp, 'named');
  run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    csvInput,
    '--output-dir',
    namedDir,
    '--path-template',
    '{name}',
  ]);
  assert.deepEqual((await readdir(namedDir)).sort(), ['Alice.docx', 'Bob.docx']);

  const archive = path.join(temp, 'batch.zip');
  const archiveDryRun = run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    csvInput,
    '--output-zip',
    archive,
    '--dry-run',
  ]);
  assert.equal(archiveDryRun.stdout, `create\t${archive}\n`);
  await assert.rejects(readFile(archive), { code: 'ENOENT' });
  assert.equal(
    run(process.execPath, [bin, 'generate', template, '--input', csvInput, '--output-zip', archive])
      .stdout,
    `${archive}\n`,
  );
  const zip = new PizZip(await readFile(archive));
  assert.deepEqual(Object.keys(zip.files).sort(), ['document-1.docx', 'document-2.docx']);
  assert.match(
    new PizZip(zip.file('document-1.docx').asUint8Array()).file('word/document.xml').asText(),
    /Hello Alice!/u,
  );
  assert.match(
    new PizZip(zip.file('document-2.docx').asUint8Array()).file('word/document.xml').asText(),
    /Hello Bob!/u,
  );
  const archiveConflict = run(
    process.execPath,
    [bin, 'generate', template, '--input', csvInput, '--output-zip', archive],
    cliRoot,
    1,
  );
  assert.match(archiveConflict.stderr, /Output already exists/u);
  assert.equal(
    run(process.execPath, [
      bin,
      'generate',
      template,
      '--input',
      csvInput,
      '--output-zip',
      archive,
      '--overwrite',
      '--dry-run',
    ]).stdout,
    `replace\t${archive}\n`,
  );
  run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    csvInput,
    '--output-zip',
    archive,
    '--overwrite',
  ]);

  const namedArchive = path.join(temp, 'named.zip');
  run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    csvInput,
    '--output-zip',
    namedArchive,
    '--path-template',
    'group/{name}',
  ]);
  const namedZip = new PizZip(await readFile(namedArchive));
  assert.deepEqual(
    Object.values(namedZip.files)
      .filter((archiveEntry) => !archiveEntry.dir)
      .map((archiveEntry) => archiveEntry.name)
      .sort(),
    ['group/Alice.docx', 'group/Bob.docx'],
  );
  const conflictingTargets = run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--input',
      csvInput,
      '--output-dir',
      outputDir,
      '--output-zip',
      archive,
    ],
    cliRoot,
    2,
  );
  assert.match(conflictingTargets.stderr, /--output-dir' conflicts with '--output-zip/u);
  const otherOutputPairs = [
    ['--output-file', path.join(temp, 'single.docx'), '--output-dir', outputDir],
    ['--output-file', path.join(temp, 'single.docx'), '--output-zip', archive],
  ];
  for (const options of otherOutputPairs) {
    const outputPairConflict = run(
      process.execPath,
      [bin, 'generate', template, ...options],
      cliRoot,
      2,
    );
    assert.match(outputPairConflict.stderr, /conflicts with/u);
  }
  const conflictingInputs = run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--input',
      csvInput,
      '--set',
      'name=Alice',
      '--output-zip',
      archive,
    ],
    cliRoot,
    2,
  );
  assert.match(conflictingInputs.stderr, /--input' conflicts with '--set/u);
  const missingOutput = run(
    process.execPath,
    [bin, 'generate', template, '--set', 'name=Alice'],
    cliRoot,
    2,
  );
  assert.match(missingOutput.stderr, /Choose one of --output-file, --output-dir, or --output-zip/u);
  const invalidArchiveName = run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--input',
      csvInput,
      '--output-zip',
      path.join(temp, 'not-zip.docx'),
    ],
    cliRoot,
    1,
  );
  assert.match(invalidArchiveName.stderr, /UnsupportedExtension/u);

  const noHeader = path.join(temp, 'no-header.csv');
  await writeFile(noHeader, 'Alice\nBob\n');
  const headerError = run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--input',
      noHeader,
      '--output-dir',
      path.join(temp, 'no-header-out'),
    ],
    cliRoot,
    1,
  );
  assert.match(headerError.stderr, /first row contains headers/u);

  const duplicateHeader = path.join(temp, 'duplicate-header.csv');
  await writeFile(duplicateHeader, 'name,name\nAlice,Bob\n');
  const duplicateError = run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--input',
      duplicateHeader,
      '--output-dir',
      path.join(temp, 'duplicate-header-out'),
    ],
    cliRoot,
    1,
  );
  assert.match(duplicateError.stderr, /Duplicate CSV header "name"/u);

  const collectionTemplate = path.join(temp, 'collection.docx');
  await writeFile(collectionTemplate, createDocx([['{#items}'], ['{name}'], ['{/items}']]));
  const collectionError = run(
    process.execPath,
    [
      bin,
      'inspect',
      collectionTemplate,
      '--format',
      'csv-template',
      '--output',
      path.join(temp, 'collection.csv'),
    ],
    cliRoot,
    1,
  );
  assert.match(collectionError.stderr, /do not support collection field/u);

  const gbkInput = path.join(temp, 'gbk.csv');
  await writeFile(
    gbkInput,
    Buffer.from([...new TextEncoder().encode('name\n'), 0xd6, 0xd0, 0xce, 0xc4]),
  );
  const encodingError = run(
    process.execPath,
    [bin, 'generate', template, '--input', gbkInput, '--output-dir', path.join(temp, 'gbk-error')],
    cliRoot,
    1,
  );
  assert.match(encodingError.stderr, /--input-encoding gbk/u);
  run(process.execPath, [
    bin,
    'generate',
    template,
    '--input',
    gbkInput,
    '--input-encoding',
    'gbk',
    '--output-dir',
    path.join(temp, 'gbk-output'),
  ]);

  const collectionDocx = path.join(temp, 'xlsx-collection.docx');
  await writeFile(
    collectionDocx,
    createDocx([
      ['{name}'],
      ['{#lineItems}'],
      ['{sku}'],
      ['{/lineItems}'],
      ['{#payments}'],
      ['{method}'],
      ['{/payments}'],
    ]),
  );
  const xlsxInput = path.join(temp, 'records.xlsx');
  run(process.execPath, [
    bin,
    'inspect',
    collectionDocx,
    '--format',
    'excel-template',
    '--output',
    xlsxInput,
  ]);
  const importXlsx = (subpath) =>
    import(
      new URL(
        '../../../packages/tabular-input/node_modules/@office-kit/xlsx/dist/' + subpath + '.mjs',
        import.meta.url,
      ).href
    );
  const { fromArrayBuffer, loadWorkbook, workbookToBytes } = await importXlsx('io');
  const { addWorksheet } = await importXlsx('workbook');
  const { appendRow } = await importXlsx('worksheet');
  const xlsxBook = await loadWorkbook(fromArrayBuffer(await readFile(xlsxInput)));
  assert.deepEqual(
    xlsxBook.sheets.map((ref) => ref.sheet.title),
    ['Records', 'lineItems', 'payments'],
  );
  appendRow(addWorksheet(xlsxBook, 'Notes', { index: 0 }), ['Ignore']);
  appendRow(xlsxBook.sheets[1].sheet, ['r1', 'Alice']);
  appendRow(xlsxBook.sheets[1].sheet, ['r2', 'Bob']);
  appendRow(xlsxBook.sheets[2].sheet, ['r2', 'SKU-B']);
  appendRow(xlsxBook.sheets[2].sheet, ['r1', 'SKU-A']);
  appendRow(xlsxBook.sheets[3].sheet, ['r1', 'Cash']);
  await writeFile(xlsxInput, await workbookToBytes(xlsxBook));
  const xlsxArchive = path.join(temp, 'xlsx-documents.zip');
  run(process.execPath, [
    bin,
    'generate',
    collectionDocx,
    '--input',
    xlsxInput,
    '--sheet',
    'Records',
    '--output-zip',
    xlsxArchive,
  ]);
  const xlsxZip = new PizZip(await readFile(xlsxArchive));
  assert.match(
    new PizZip(xlsxZip.file('document-1.docx').asUint8Array()).file('word/document.xml').asText(),
    /Alice.*SKU-A.*Cash/u,
  );
  assert.match(
    new PizZip(xlsxZip.file('document-2.docx').asUint8Array()).file('word/document.xml').asText(),
    /Bob.*SKU-B/u,
  );

  const legacyExcel = run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--input',
      path.join(temp, 'legacy.xls'),
      '--output-dir',
      path.join(temp, 'legacy-output'),
    ],
    cliRoot,
    2,
  );
  assert.match(legacyExcel.stderr, /Only .xlsx Excel files are supported/u);
  const badSheetOption = run(
    process.execPath,
    [
      bin,
      'generate',
      template,
      '--input',
      csvInput,
      '--sheet',
      'Records',
      '--output-dir',
      path.join(temp, 'bad-sheet-output'),
    ],
    cliRoot,
    2,
  );
  assert.match(badSheetOption.stderr, /--sheet requires .xlsx input/u);

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
