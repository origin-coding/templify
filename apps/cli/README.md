# Templify CLI

[English](README.md) | [简体中文](https://github.com/origin-coding/templify/blob/main/apps/cli/README.zh-CN.md)

Fill DOCX templates from command-line values, CSV, or XLSX. The `templify`
executable provides `inspect` and `generate` using the same core as Desktop.

## Run from source

Requirements: Node.js **24.11.0 or later** and pnpm **11**, using the version pinned
in the root `packageManager` field. Run from the repository root:

```shell
pnpm install
pnpm --filter @templify/core --filter @templify/node-output --filter @templify/tabular-input --filter @templify/cli build
node apps/cli/dist/index.js --help
```

The examples below use the installed executable name `templify`. From source,
replace it with `node apps/cli/dist/index.js` and run from the repository root.
Paths are relative to the current working directory.

## Quick start

Download the files from the [demo guide](https://github.com/origin-coding/templify/tree/main/docs/demos)
into your working directory. Generate two checkout documents:

```shell
templify inspect equipment-checkout.docx
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --sheet checkouts --output-dir output --path-template "{checkoutId}.docx"
```

The results are `output/EC-001.docx` with three equipment rows and
`output/EC-002.docx` with two. For a single manual record:

```shell
templify generate workshop-registration.docx --set "participantName=Alex Morgan" --set "registrationId=001234" --set "workshopTitle=Introduction to Urban Gardening" --set "workshopDate=2026-11-06" --set "seatCount=2" --set "materialsRequested=true" --output-file registration.docx
```

Run `templify --help`, `templify inspect --help`, or `templify generate --help`
for command help. The CSV and generic PDF examples below assume a template
whose fields match the shown input; `--set name=Alice` assumes a `{name}` tag.

## Inspect a template

```shell
templify inspect template.docx
templify inspect template.docx --format json
templify inspect template.docx --format json --output fields.json
templify inspect template.docx --format csv-template --output records.csv
templify inspect template.docx --format excel-template --output records.xlsx
```

| Option        | Behavior                                                                         |
| ------------- | -------------------------------------------------------------------------------- |
| `--format`    | `table` (default), `json`, `csv-template`, or `excel-template`.                  |
| `--output`    | Write output to a file instead of stdout. Required for CSV/XLSX template export. |
| `--overwrite` | Allow replacing that output file. Requires `--output`.                           |

With `--output`, JSON/CSV/XLSX exports require `.json`/`.csv`/`.xlsx` suffixes.
Table output has no required suffix. CSV export produces one header row with a
UTF-8 BOM and rejects collections. XLSX export creates root and collection sheets.

## Generate documents

Choose exactly one destination:

| Option                 | Output                                                   |
| ---------------------- | -------------------------------------------------------- |
| `--output-file <path>` | One caller-named document, requiring exactly one record. |
| `--output-dir <path>`  | One document per record under a directory.               |
| `--output-zip <path>`  | One document per record in a ZIP.                        |

Other generation options:

| Option                         | Behavior                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `--set field=value`            | Repeat for scalar fields of one manual record; cannot combine with `--input`.                                               |
| `--input <path>`               | Read `.csv` or `.xlsx` records.                                                                                             |
| `--sheet <name>`               | Select the visible root worksheet of an XLSX file.                                                                          |
| `--input-encoding <encoding>`  | CSV `utf8` (default) or `gbk`.                                                                                              |
| `--path-template <template>`   | Name directory/ZIP documents from root fields and `{$index}`.                                                               |
| `--document-format <format>`   | `docx` (default) or `pdf` per record.                                                                                       |
| `--merged-pdf <relative-path>` | Add an ordered merged PDF to directory/ZIP output.                                                                          |
| `--render-options <file.json>` | Configure scalar and collection-child output formatting.                                                                    |
| `--dry-run`                    | Validate inputs, formats, paths, and filesystem conflicts; print planned actions without rendering or writing final output. |
| `--overwrite`                  | Explicitly allow replacing existing output files.                                                                           |

`--sheet` requires XLSX; `--input-encoding` requires CSV. Manual `--set` does not
accept collection arrays or JSON records. Use XLSX for collections, or Desktop.

### Directory and ZIP examples

```shell
templify generate template.docx --input records.csv --output-dir output
templify generate template.docx --input records.csv --output-dir output --path-template "{department}/{name}.docx"
templify generate template.docx --input legacy.csv --input-encoding gbk --output-dir output
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --sheet checkouts --output-zip checkouts.zip --path-template "{checkoutId}.docx"
```

Default names are `document-{$index}.docx` or `document-{$index}.pdf`, with indexes
starting at 1. Only literal template separators create folders. Record values are
sanitized as segments, including invalid Windows characters and reserved names.
Final paths are checked for traversal. Duplicate planned filenames are errors
even with `--overwrite`; include a unique field or `{$index}`.

A path template without an extension gets the selected suffix; a different
extension fails. `--output-file` requires `.docx`/`.pdf` according to format,
`--output-zip` requires `.zip`, and `--merged-pdf` requires a relative `.pdf` path.
Output cannot overwrite the template, input, or formatting configuration file.

### PDF output

```shell
templify generate template.docx --set "name=Alice" --output-file alice.pdf --document-format pdf
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --output-dir output --path-template "{checkoutId}.pdf" --document-format pdf --merged-pdf all.pdf
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --output-zip checkouts.zip --path-template "{checkoutId}.docx" --merged-pdf all.pdf
```

With DOCX plus `--merged-pdf`, individual PDFs stay in memory; only DOCX files
and the merged PDF are published. With PDF output, individual PDFs and the
optional merged PDF are published. There is no merged DOCX mode or simultaneous
individual DOCX and PDF export.

**PDF output may contain font, formatting, or pagination errors, even with
embedded fonts. The final rendered DOCX is authoritative.** Conversion warnings
use stderr; their absence does not guarantee fidelity. Review PDFs before sharing
or printing. Conversion may download fallback fonts not already cached.
The CLI does not enumerate system fonts.

## Fields and input values

Supported hints are `string`, `number`, `boolean`, `date`, `datetime`, and
`option[...]`. A tag without a hint is a string. Option values are suggestions.

| Hint          | Input behavior                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `string`      | Preserves strings such as `001234`; finite numbers and booleans can become text.                                           |
| `number`      | Finite numbers or numeric text, without currency symbols or grouping separators.                                           |
| `boolean`     | Native booleans or case-insensitive `true`/`false` text.                                                                   |
| `date`        | Native dates or `YYYY-MM-DD` text.                                                                                         |
| `datetime`    | Native dates or ISO-style text such as `2026-11-06T09:30:00+08:00`; without an offset, uses the runtime's local time zone. |
| `option[...]` | Text, including values outside the suggested list.                                                                         |

CSV/XLSX headers must exactly match field names; column position is irrelevant.
Missing or duplicate columns fail; extra columns are ignored with diagnostics.
Empty rows are skipped. CSV defaults to UTF-8 with or without a BOM and supports
scalar-only templates. Spreadsheet editors may convert `001234` to a number;
export an XLSX input template and keep identifier columns as text when this matters.

### XLSX collections

The first visible worksheet is the root by default; `--sheet` selects another.
One nonempty root row produces one document. A loop `{#items}...{/items}` requires
a visible worksheet named exactly `items`. Only one collection level is supported;
nested and inverted loops fail.

| Worksheet       | Required columns                                        |
| --------------- | ------------------------------------------------------- |
| Root            | `__templify_id` and root scalar field names.            |
| Each collection | `__templify_parent_id` and collection item field names. |

Use unique direct text root IDs, such as `r1`/`r2`, and repeat the corresponding
ID on child rows. Sorting preserves relationships. Blank or duplicate root IDs,
unmatched parent IDs, missing collection sheets, or missing columns fail.
A collection sheet with headers and no rows produces an empty collection.
Unused sheets and columns are ignored with diagnostics. Relationship column
names are reserved in their scopes; collection names must be valid Excel sheet names.

Only `.xlsx` is accepted; convert `.xls`, `.xlsm`, and `.xlsb` first. Formula
cells use saved calculated results; missing or error results fail with a cell
location. Recalculate and save in Excel before importing. Relationship IDs must
be direct text, not formulas.

## Output formatting

Save this as `render-options.json`:

```json
{
  "locale": "en",
  "timeZone": "UTC",
  "defaults": {
    "boolean": { "trueText": "Yes", "falseText": "No" },
    "date": { "pattern": "YYYY-MM-DD" },
    "number": { "useGrouping": false, "maximumFractionDigits": 2 }
  },
  "formats": [
    { "path": ["items", "quantity"], "format": { "type": "number", "maximumFractionDigits": 0 } }
  ]
}
```

```shell
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --output-dir formatted-output --path-template "{checkoutId}.docx" --render-options render-options.json
```

A `formats` field rule replaces the entire type default; otherwise `defaults`
applies, then the canonical format. Root field paths have one element; collection
child paths have two. Null renders as empty text. String/option fields have no
formatting rules. Formatting changes document text, not input data or filenames.

Locales are `en` and `zh-CN`. Dates represent calendar dates; datetimes can use an
IANA time zone, defaulting to the runtime zone. Without custom formats, booleans
render as `true`/`false`, dates as `YYYY-MM-DD`, datetimes as `YYYY-MM-DD HH:mm:ss`, and numbers
as their canonical string values. See the
[format reference](https://github.com/origin-coding/templify/blob/main/docs/decisions/render-formatting.md).

## Diagnostics and scripting

Inspection prints to stdout unless `--output` is used. Generation prints absolute
published paths, one per line. Dry runs print planned actions and destinations
separated by a tab. Diagnostics use stderr.

| Exit code | Meaning                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `0`       | Success.                                                                            |
| `1`       | Input/template/format validation, rendering, publication, or other runtime failure. |
| `2`       | Usage error, including invalid arguments or unreadable/invalid formatting JSON.     |

Dry runs do not render or convert PDFs, so they cannot detect all rendering,
font, or layout failures. Overwrite is disabled by default.

## Development

After the source build above, run the CLI build watcher from the repository root
in a separate terminal:

```shell
pnpm --filter @templify/cli dev
```

Rerun commands after it rebuilds. To check the packaged executable:

```shell
pnpm --filter @templify/cli smoke
```

`smoke` packs the CLI,
installs it in an isolated directory, and checks the installed executable.
The build bundles shared workspace packages; users do not install those private
packages separately.

See the [contribution guide](https://github.com/origin-coding/templify/blob/main/CONTRIBUTING.md)
for repository checks and development conventions.

## License

[Apache License 2.0](https://github.com/origin-coding/templify/blob/main/LICENSE).
