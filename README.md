# Templify

Templify is a focused desktop utility for filling DOCX templates from user-provided records.

The project is in its initial development stage. Its first end-to-end milestone is:

```text
template.docx
  -> inspect fields
  -> create one record
  -> render
  -> output.docx
```

## Scope

Templify is designed to support:

- DOCX templates with lightweight field hints.
- Manual, CSV, and Excel/XLSX input.
- Single-document, directory, and archive output.
- Safe output path templates and explicit conflict handling.

Templify is not intended to become a document management system, workflow engine, office suite, or general-purpose schema platform.

## Repository layout

```text
apps/       Executable applications such as Desktop and CLI.
packages/   Shared domain, application, and infrastructure packages.
tests/      Cross-package integration tests and fixtures.
```

The current shared packages are:

- `@templify/core`: template preparation, input normalization, generation planning, in-memory rendering, PDF derivation boundaries, and artifact packaging.
- `@templify/node-output`: pure publication planning, read-only filesystem preflight, and confirmed filesystem publication.
- `@templify/tabular-input`: shared CSV/XLSX parsing and input-template export.

See [the staged pipeline decision](./docs/decisions/staged-core-pipeline.md) for the responsibility boundaries and public flow.

## Development

Requirements:

- Node.js 24.11 or later.
- pnpm 11.

Install dependencies:

```shell
pnpm install
```

Run all repository checks:

```shell
pnpm check
```

Individual checks are also available:

```shell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

## CLI

The CLI supports template inspection, manual values, CSV/XLSX records, and single, directory, or ZIP DOCX output.
It uses the same core pipeline as future desktop adapters.

For development, run the build watcher in one terminal:

```shell
pnpm --filter @templify/cli dev
```

After its first build, run a CLI command in another terminal:

```shell
pnpm --filter @templify/cli start inspect template.docx
```

The watcher rebuilds after source changes; rerun the CLI command to try them. To
use breakpoints, debug `apps/cli/dist/index.js` in an IDE. Source maps point back
to the TypeScript source.

For a one-off build or a packaged CLI check:

```shell
pnpm --filter @templify/cli build
node apps/cli/dist/index.js inspect template.docx --format json
node apps/cli/dist/index.js generate template.docx --set name=Alice --output-file output.docx
node apps/cli/dist/index.js generate template.docx --set name=Alice --output-file output.docx --dry-run
node apps/cli/dist/index.js inspect template.docx --format csv-template --output records.csv
node apps/cli/dist/index.js generate template.docx --input records.csv --output-dir out
node apps/cli/dist/index.js generate template.docx --input records.csv --output-dir out --path-template '{name}'
node apps/cli/dist/index.js generate template.docx --input legacy.csv --input-encoding gbk --output-dir out
node apps/cli/dist/index.js generate template.docx --input records.csv --output-zip documents.zip
node apps/cli/dist/index.js generate template.docx --input records.csv --output-zip documents.zip --path-template '{name}'
node apps/cli/dist/index.js inspect template.docx --format excel-template --output records.xlsx
node apps/cli/dist/index.js generate template.docx --input records.xlsx --output-dir out
node apps/cli/dist/index.js generate template.docx --input records.xlsx --sheet Records --output-zip documents.zip
node apps/cli/dist/index.js generate template.docx --set name=Alice --output-file output.pdf --document-format pdf
node apps/cli/dist/index.js generate template.docx --input records.csv --output-dir out --document-format pdf --merged-pdf all.pdf
node apps/cli/dist/index.js generate template.docx --input records.csv --output-zip documents.zip --merged-pdf all.pdf
```

CSV input requires an exact-name header row. UTF-8 with or without a BOM is accepted by
default; use `--input-encoding gbk` for legacy GBK files. CSV input and template
export reject DOCX templates with collection fields. Exported CSV templates have one
header row and a UTF-8 BOM for spreadsheet compatibility. Directory and ZIP output
default to `document-{$index}.docx` for DOCX or `document-{$index}.pdf` for PDF.
Each nonempty record produces one document. CSV and spreadsheet applications may convert text such as `001234` when editing; use an XLSX workflow
when those values must be protected.

Repeat `--set field=value` for multiple fields. The default conflict policy refuses to
replace existing output; pass `--overwrite` to replace it. Diagnostics go to stderr,
while command results go to stdout.

`--document-format` selects `docx` (the default) or `pdf` for each record. A
`--merged-pdf` path is available only with `--output-dir` or `--output-zip`. With
DOCX output, the per-record PDFs used for merging stay in memory; only DOCX
files and the aggregate PDF are published. With PDF output, both the
per-record PDFs and aggregate PDF are published. Conversion can change fonts,
layout, or pagination relative to the DOCX template; conversion losses are
reported on stderr.

`inspect --format json`, `csv-template`, and `excel-template` require `.json`,
`.csv`, and `.xlsx` output paths respectively. Table output has no required
suffix. `--output-file` requires `.docx` or `.pdf` according to the selected
document format, `--output-zip` requires `.zip`, and `--merged-pdf` requires a
relative `.pdf` path. A `--path-template` without an extension gets the selected
document extension; a mismatched extension is an error.

Check the packed executable from an isolated installation with:

```shell
pnpm --filter @templify/cli smoke
```

## XLSX input workbooks

For scalar-only templates, the first visible worksheet is read by default. Use `--sheet <name>`
to select a different root worksheet. The first row contains exact template field names;
each nonempty later row produces one document. The same rule selects the root worksheet
when the DOCX template contains collections.

For each top-level DOCX loop, use a worksheet whose name exactly matches the loop name.
For example, `{#lineItems}...{/lineItems}` reads the `lineItems` worksheet. Multiple
collections use separate worksheets. A workbook with collections has these columns:

| Worksheet                 | Required columns                                                |
| ------------------------- | --------------------------------------------------------------- |
| Root worksheet            | `__templify_id`, then root scalar field names                   |
| Each collection worksheet | `__templify_parent_id`, then that collection's item field names |

The two relationship columns contain direct text IDs. Give each root row a unique ID
such as `r1` or `r2`; each collection item refers to its root row with that ID.
IDs stay attached when rows are sorted. Blank and duplicate root IDs, unmatched
parent IDs, missing collection worksheets, and missing headers are errors. A collection
worksheet with headers and no data rows produces an empty collection. For collection workbooks, extra worksheets and columns are ignored with warnings. The exported XLSX template sets ID and string
columns to text format, but users can also prepare a workbook manually.

A formula cell uses the calculated result saved in the XLSX file. Templify does not
calculate formulas; missing or error results fail with the worksheet and cell position.
Recalculate and save the workbook in Excel before importing when needed. Relationship
IDs must be direct text, not formulas. Only `.xlsx` is accepted as Excel input; convert
`.xls`, `.xlsm`, `.xlsb`, and Excel template formats first. Collection names must be
valid Excel worksheet names. The reserved relationship column names cannot also be
template fields in the corresponding scope.

## Contributing

Repository content, source code, comments, issues, pull requests, and commit messages use English. See [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting changes.

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
