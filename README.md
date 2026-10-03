# Templify

[English](README.md) | [简体中文](README.zh-CN.md)

Templify fills Word templates with your records. Use Desktop to prepare forms
interactively, or the CLI to generate documents from scripts. Each record produces
its own document; collections repeat content inside that document.

## Features

- Inspect DOCX templates and discover fields with lightweight type hints.
- Enter multiple records manually in Desktop, including collection items.
- Import CSV or XLSX data by field name, regardless of column order.
- Generate one DOCX or PDF per record, as a single file, a directory, or a ZIP.
- Add an ordered merged PDF to directory or ZIP output.
- Preview one record or all records as PDF in Desktop before choosing an output location.
- Configure date, datetime, number, and boolean output formats.
- Preview output paths, sanitize record-derived filenames, and refuse existing
  output files unless overwrite is explicitly selected.
- Use the desktop interface in English or Simplified Chinese.

Templify does not edit DOCX/PDF content, calculate spreadsheet formulas, or provide
accounts, workflows, or a document-management system.

## Try the demos

The [demo guide](docs/demos/README.md) includes two English-language templates:

| Example                                                        | What it demonstrates                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| [Workshop registration](docs/demos/workshop-registration.docx) | Text, dates, numbers, booleans, and repeated fields.         |
| [Equipment checkout](docs/demos/equipment-checkout.docx)       | A repeating equipment table within each document.            |
| [Equipment workbook](docs/demos/equipment-checkout.xlsx)       | Two records with three and two equipment items respectively. |

In Desktop:

1. Choose a DOCX template in **Select Template**.
2. In **Prepare Data**, enter records or import CSV/XLSX. For the equipment demo,
   import the supplied workbook with `checkouts` as the root worksheet.
3. Optionally adjust field formats or preview the current record or all records as PDF.
4. In **Configure Output**, choose DOCX or PDF and a single file, directory, or ZIP.
   Single-file output requires exactly one record.
5. Choose the destination, preview paths, and generate. Review the overwrite
   confirmation if any target already exists.

For the equipment demo, choose directory or ZIP output with `{checkoutId}.docx`
to produce `EC-001.docx` and `EC-002.docx`.

## Template tags

| Tag                                                     | Meaning                                            |
| ------------------------------------------------------- | -------------------------------------------------- |
| `{name}` or `{name:string}`                             | Text; leading zeros remain text.                   |
| `{amount:number}`                                       | Numeric input.                                     |
| `{enabled:boolean}`                                     | Boolean input.                                     |
| `{birthday:date}`                                       | Calendar date.                                     |
| `{startsAt:datetime}`                                   | Date and time.                                     |
| `{department:option["Engineering","Finance","Office"]}` | Suggested choices; other text values are accepted. |

Place collection item fields inside a loop, for example:

```text
{#items}
{itemName} - {quantity:number}
{/items}
```

Collections support one level of scalar item fields. Nested and inverted loops
are unsupported. A collection item does not create a separate document.

## Data and output rules

- CSV/XLSX headers must match field names exactly. Missing or duplicate columns
  fail; extra columns are ignored with diagnostics. Empty rows are skipped.
- CSV supports scalar fields only. XLSX supports collections through separate
  worksheets linked by `__templify_id` and `__templify_parent_id`.
- Only `.xlsx` Excel files are supported. Formula cells require a usable result
  already saved by Excel; Templify does not calculate formulas.
- Directory/ZIP path templates accept literal text and placeholders, such as
  `{department}/{name}.docx`, plus `{$index}` for a one-based record index.
  Record values are sanitized as path segments; only template separators create folders.
- There is no multi-record merged DOCX output. Optional merged PDFs follow the
  accepted record order.

See the [CLI guide](apps/cli/README.md) for input conversions, collection workbook
rules, command options, and formatting JSON.

## Formatting and limitations

Desktop Settings saves interface language and type-level format defaults.
Prepare Data provides rules for the current template's fields, including collection
children. These rules clear when the template changes or a new task starts.
Records and document tasks are not restored after closing the app.

**PDF previews and exports may contain font, formatting, or pagination errors,
even with embedded fonts. The final rendered DOCX is authoritative.** Conversion
diagnostics cannot guarantee visual fidelity. Review DOCX output in Word and
review PDFs before sharing or printing.

DOCX filling does not require network access. PDF conversion may download and
cache fallback fonts when suitable embedded, local Desktop, or cached fonts are
unavailable. Fonts are not bundled. Desktop does not provide direct printing;
open generated files in an external application to print them.

## Run from source

Requirements: Node.js **24.11.0 or later** and pnpm **11**, using the version pinned
in the root `packageManager` field. Run from the repository root:

```shell
pnpm install
pnpm --filter @templify/desktop dev
```

The desktop development command builds shared packages and starts watchers,
Nuxt, and Electron. Electron downloads its runtime separately; if the download
is unavailable, configure `ELECTRON_MIRROR` before starting.

Build a Windows x64 NSIS installer:

```shell
pnpm --filter @templify/desktop package:win
```

The command builds Desktop and its shared packages before packaging. The installer
is written to `apps/desktop/release/`. See the [release guide](docs/releasing.md)
for the manual Actions workflow and publication steps.

To create an unpacked Windows application for development:

```shell
pnpm --filter @templify/desktop build
pnpm --filter @templify/desktop exec electron-builder --dir --win --publish never
```

Packaging output goes to `apps/desktop/release/`. This command creates an unpacked
application directory rather than an installer.

Try the CLI from source:

```shell
pnpm --filter @templify/core --filter @templify/node-output --filter @templify/tabular-input --filter @origin-coding/templify build
node apps/cli/dist/index.js inspect docs/demos/workshop-registration.docx
```

See [Contributing](CONTRIBUTING.md) for checks and development guidance.

## Repository and documentation

| Directory                | Responsibility                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `apps/desktop`           | Electron, Nuxt/Vue, and TDesign desktop application.                               |
| `apps/cli`               | CLI adapter with `inspect` and `generate`.                                         |
| `packages/core`          | In-memory template preparation, normalization, planning, rendering, and packaging. |
| `packages/tabular-input` | CSV/XLSX parsing and input-table export.                                           |
| `packages/node-output`   | Filesystem publication and Node PDF font handling.                                 |
| `tests`                  | Cross-package integration tests.                                                   |
| `docs/demos`             | Templates, input data, and bilingual instructions.                                 |
| `docs/decisions`         | Lasting architecture and product decisions.                                        |

- [CLI usage](apps/cli/README.md)
- [Release workflow](docs/releasing.md)
- [Shared format configuration](docs/decisions/render-formatting.md)
- [Core pipeline](docs/decisions/staged-core-pipeline.md)
- [PDF preview and fonts](docs/decisions/desktop-pdf-and-fonts.md)
- [Issues and feedback](https://github.com/origin-coding/templify/issues)

## License

[Apache License 2.0](LICENSE).
