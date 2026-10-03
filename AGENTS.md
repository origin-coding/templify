# AGENTS.md

## 1. Project Overview

**Templify** is a small desktop-oriented document template filling tool.

Its primary purpose is to:

1. Load and inspect a DOCX template.
2. Discover template fields and optional lightweight type hints.
3. Accept one or more records from supported input sources.
4. Render each record into DOCX, optionally deriving PDF output from it.
5. Write the result as a single document, multiple files in a directory, or multiple files in an archive.

The project exists to automate repetitive document generation tasks such as producing many printable forms from one Word template.

Templify is intentionally a **small utility**, not an office automation platform, workflow engine, form builder, low-code platform, or document management system.

Keep the implementation simple and focused.

---

## 2. Core Product Model

The fundamental processing model is:

```text
DOCX Template
    ↓
Template Inspection
    ↓
Field Definitions
    ↓
Input Source
    ↓
Record[]
    ↓
Render Planning
    ↓
DOCX Rendering
    ↓
Output Strategy
```

The central domain concepts should remain independent from the UI, CLI, Electron, and specific filesystem adapters.

The core should not depend on Electron.

---

## 3. Technology Direction

Primary language:

```text
TypeScript
```

Primary runtime:

```text
Node.js >= 24.11.0
pnpm 11 (version pinned in package.json)
```

DOCX rendering:

```text
Docxtemplater
PizZip
```

Current desktop stack:

```text
Electron
Nuxt 4 / Vue 3
TDesign
Pinia
```

The desktop UI is the primary user-facing application.

The CLI is implemented as a thin secondary adapter for automation, testing, and scripted usage.

The CLI must not become a separate implementation of the business logic.

Both Desktop and CLI should call the same application/core services.

---

## 4. Scope

### 4.1 Implemented Scope

The current code supports:

* DOCX templates.
* Template field discovery.
* Lightweight type hints embedded in template tags.
* Multiple manual records in Desktop, including one-level collection items.
* CSV input.
* Excel/XLSX input, including ID-linked collection worksheets.
* Field matching by field name, never by column order.
* Independent rendering of one or more records.
* One-level scalar collection loops within each record.
* DOCX and PDF per-record output, plus optional ordered merged PDF output.
* Desktop PDF preview for one record or all records.
* Shared boolean, date, datetime, and number output formatting.
* English and Simplified Chinese desktop UI.
* Single-document output.
* Multi-document directory output.
* Multi-document ZIP/archive output.
* Output path templates for multi-document output.
* Output path sanitization.
* Directory traversal protection.
* Invalid filename handling.
* File conflict policies:

    * error
    * overwrite

### 4.2 Explicit Non-Goals

Do not introduce the following unless a future requirement explicitly requires them:

* General-purpose schema system.
* Full JSON Schema support.
* Business validation rules.
* Workflow or approval systems.
* User accounts.
* Permissions.
* Database persistence.
* Document management.
* Template marketplace.
* Online collaboration.
* Dynamic form platform.
* Low-code platform.
* Cartesian-product record generation.
* Automatic generation of business data.
* Complex spreadsheet formula evaluation.
* Full office suite functionality.
* PDF editing.
* General-purpose DOCX editor.

Do not expand the project into a large office platform.

---

## 5. Template Fields

Templify uses DOCX tags as the source of truth for fields.

A field can optionally contain a lightweight type hint.

Examples:

```text
{name}
{name:string}
{birthday:date}
{startsAt:datetime}
{amount:number}
{enabled:boolean}
{department:option["Engineering","Finance","Office"]}
```

A tag without an explicit type is treated as:

```text
string
```

Therefore:

```text
{name}
```

is semantically equivalent to:

```text
{name:string}
```

---

## 6. Type Hints

Type hints exist only to assist:

* UI control selection.
* Input conversion.
* Excel/CSV interoperability.
* Output formatting.

They are **not a business validation system**.

Supported hints remain deliberately small:

```text
string
number
boolean
date
datetime
option[...]
```

`date` represents a calendar date; `datetime` represents a date and time. Keep their normalization and formatting semantics distinct.

Do not add validation-oriented syntax such as:

```text
required
min
max
minLength
maxLength
regex
cross-field validation
conditional validation
```

For example, do not evolve tags into something like:

```text
{amount:number|required|min=0|max=10000}
```

That would effectively create an embedded schema language and is outside the intended scope.

---

## 7. Option Type

Example:

```text
{department:option["Engineering","Finance","Office"]}
```

`option` values are primarily UI hints.

They should normally be displayed as selectable options in the desktop application.

They should not automatically become strict business constraints.

The user is responsible for determining whether input data is semantically correct.

Templify should avoid pretending to understand business rules.

---

## 8. Template Parsing

Do not manually scan or modify raw DOCX XML unless a specific feature cannot reasonably be implemented through the selected DOCX library.

Use Docxtemplater's parsing/inspection capabilities where practical.

The project may provide its own small tag parser for Templify-specific type-hint syntax.

For example:

```text
birthday:date
```

should become conceptually:

```ts
{
  name: "birthday",
  hint: {
    type: "date"
  }
}
```

The Templify tag syntax should be isolated from Docxtemplater-specific APIs as much as reasonably possible.

Do not scatter Docxtemplater tag parsing logic throughout the application.

---

## 9. Field Definition

The current model separates scalar fields from one-level collections:

```ts
type FieldHint =
  | { readonly type: 'string' }
  | { readonly type: 'number' }
  | { readonly type: 'boolean' }
  | { readonly type: 'date' }
  | { readonly type: 'datetime' }
  | { readonly type: 'option'; readonly values: readonly string[] };

interface ScalarFieldDefinition {
  readonly kind: 'scalar';
  readonly name: string;
  readonly hint: FieldHint;
}

interface CollectionFieldDefinition {
  readonly kind: 'collection';
  readonly name: string;
  readonly fields: readonly ScalarFieldDefinition[];
}

type FieldDefinition = ScalarFieldDefinition | CollectionFieldDefinition;
```

Collection tags use `{#items}...{/items}`. Collection children are scalar fields.
Nested collections, inverted loops, and arbitrary expressions are unsupported.
Use the definitions in `packages/core/src/template/field-definition.ts` as the source of truth.
Prefer small and explicit models.

---

## 10. Record Model

Templify works with generic records.

It should not introduce business-specific concepts such as:

```text
Person
Participant
ProjectMember
Customer
Employee
```

into the core.

Conceptually:

```ts
type ScalarValue = string | number | boolean | Date | null;
type CollectionItemData = Readonly<Record<string, ScalarValue>>;
type CollectionData = readonly CollectionItemData[];
type RecordValue = ScalarValue | CollectionData;
type RecordData = Readonly<Record<string, RecordValue>>;
```

The tool does not care whether a record represents:

* a person,
* a project,
* a device,
* a contract,
* an invoice,
* or any other business concept.

---

## 11. Input Sources

Supported input sources are:

```text
Manual Input
CSV
Excel/XLSX
```

All input sources normalize into the same:

```text
RecordData[]
```

representation.

The renderer must not need to know whether records originated from the UI, CLI, CSV, or Excel.

---

## 12. Manual Input

Manual input is intended for small datasets.

The desktop UI dynamically generates scalar controls and collection item editors from discovered template fields and type hints.

Examples:

```text
string  -> text input
number  -> numeric input
boolean -> checkbox/switch
date    -> date picker
datetime -> date/time picker
option  -> select
```

CLI manual input uses repeated `--set field=value` arguments for one scalar record. It does not accept collection arrays or JSON records; use XLSX for CLI collections.

Do not build an interactive terminal UI unless a real requirement appears.

---

## 13. CSV Input

CSV supports scalar-only templates. It accepts UTF-8 (with or without a BOM) and GBK. CSV columns are matched to template fields **by name**.

Column position must have no semantic meaning.

For example:

```text
name,department,birthday
```

and:

```text
birthday,name,department
```

must behave identically.

CSV values should default to strings unless an explicit template type hint provides a reasonable conversion.

Do not aggressively infer types from text.

For example:

```text
001234
```

must not automatically become:

```text
1234
```

when the field is a normal string.

---

## 14. Excel Input

Excel columns are also matched by field name.

Never depend on spreadsheet column order.

Where possible, preserve native Excel cell types.

Examples include:

```text
string
number
boolean
date
```

Type hints may assist normalization and formatting.

Do not implement a spreadsheet formula engine.

If formula cells are supported, use an existing cached/calculated result when available.

If no usable result exists, return an explicit error rather than attempting to evaluate arbitrary Excel formulas.

Only `.xlsx` is supported. Use the first visible worksheet as the root by default, or select a visible root worksheet by name.

For collection templates, the root sheet contains `__templify_id` and root scalar columns. Each collection has a visible worksheet whose name exactly matches the loop, containing `__templify_parent_id` and child scalar columns. Root IDs must be unique direct text values; child rows link by those IDs. Relationship cells cannot be formulas. Missing collection sheets, blank or duplicate root IDs, and unmatched parent IDs are errors. A headers-only collection sheet represents an empty collection.

Keep this protocol in `packages/tabular-input`; do not add collection assembly to command handlers or Vue components.

---

## 15. File Input Validation

Implemented behavior:

### Missing required template field column

```text
Error
```

### Duplicate column names

```text
Error
```

### Extra columns not referenced by the template

```text
Ignore
```

Emit diagnostics for unused columns and worksheets; keep diagnostics separate from generated data.

### Empty rows

```text
Ignore
```

Avoid positional matching.

---

## 16. Rendering Model

Templify uses independent per-record document generation:

```text
one RecordData -> one rendered DOCX
```

Exactly one record may be written to one caller-named DOCX or PDF file. One or more records may be written as separate documents under a directory or in an archive.

PDF conversion derives from the rendered DOCX. Desktop and CLI select one per-record format (`docx` or `pdf`) and may add an ordered merged PDF in directory or archive mode. DOCX plus merged PDF keeps individual PDF intermediates in memory. Do not advertise simultaneous per-record DOCX and PDF export as an adapter feature.

The rendered DOCX is authoritative. PDF previews and exports may have font, formatting, or pagination errors, even with embedded fonts. Keep the visible PDF notice; conversion diagnostics cannot guarantee fidelity. Direct printing is not implemented.

Each record produces one document:

Example:

```text
Record 1 -> document 1
Record 2 -> document 2
Record 3 -> document 3
```

Each document can then be written to:

* a directory, or
* an archive.

Templify does not provide an application-level multi-record merged DOCX mode. Collection and loop support within one `RecordData` remains valid template behavior, but it must not be treated as an implicit application-level records loop.

The authoritative rationale and consequences are recorded in GitHub Issue [#10](https://github.com/origin-coding/templify/issues/10).

---

## 17. Output Modes

The primary output modes are:

```text
SingleDocument
Directory
Archive
```

Conceptually:

```ts
type OutputMode =
  | "single-document"
  | "directory"
  | "archive";
```

`single-document` accepts exactly one record. Directory and archive modes may accept one or more records and preserve the accepted output-plan order.

---

## 18. Path Templates

Directory and archive modes support user-defined output path templates. Root scalar placeholders and `{$index}` (one-based accepted record index) are supported; collection children are not path values.

Example:

```text
{department}/{name}.docx
```

Possible output:

```text
Engineering/
  Alice.docx
  Bob.docx

Finance/
  Carol.docx
```

Path template interpolation must remain deliberately simple.

Prefer:

```text
literal text + {field}
```

Do not introduce:

* arbitrary JavaScript,
* functions,
* expressions,
* environment variable expansion,
* filesystem expressions,
* executable code.

A path template is not a general-purpose expression language.

---

## 19. Path Security

Path handling is security-sensitive.

Two distinct problems must be handled:

1. Directory/path traversal.
2. Invalid filenames.

### 19.1 Interpolated Values Are Path Segments

Values originating from records must never be allowed to introduce directory hierarchy.

For example:

```text
template:
{department}/{name}.docx
```

Only the `/` in the template defines a directory boundary.

If:

```text
department = "../../Windows/System32"
```

the interpolated field must be sanitized as a single safe path segment.

It must not escape the output root.

### 19.2 Final Path Verification

After interpolation and sanitization:

1. Resolve the final path relative to the configured output root.
2. Normalize it.
3. Verify that the result is still inside the output root.

Never rely only on string replacement or sanitization.

Apply defense in depth.

### 19.3 ZIP/Archive Safety

Apply the same safe relative-path rules to archive entries.

Do not create unsafe ZIP entries such as:

```text
../../target
```

Avoid Zip Slip style vulnerabilities.

---

## 20. Windows Filename Compatibility

Windows is an important target platform.

Handle invalid filename characters such as:

```text
< > : " / \ | ? *
```

Also handle reserved device names such as:

```text
CON
PRN
AUX
NUL
COM1
COM2
...
COM9
LPT1
LPT2
...
LPT9
```

Trailing dots and spaces should also be handled safely.

Keep filename sanitization in a dedicated reusable component rather than scattering checks across output implementations.

---

## 21. Conflict Policy

Version 1 should support only:

```text
error
overwrite
```

Conceptually:

```ts
type ConflictPolicy =
  | "error"
  | "overwrite";
```

Default behavior should be:

```text
error
```

The tool should not silently overwrite an existing file unless the user explicitly selected overwrite behavior. Duplicate paths within the same output plan remain errors even with overwrite. Protect the template, input, and render-options files from output replacement.

Automatic renaming such as:

```text
file.docx
file (2).docx
file (3).docx
```

is a possible future enhancement but is not required for version 1.

---

## 22. Architecture Direction

Current workspace boundaries:

```text
apps/
├── desktop/          Electron Main, preload, Nuxt/Vue renderer
└── cli/              inspect and generate adapters
packages/
├── core/             in-memory preparation, normalization, planning, rendering, packaging
├── tabular-input/    CSV/XLSX parsing and input-template export
└── node-output/      filesystem publication and Node PDF font handling
tests/                cross-package integration fixtures and checks
docs/
├── decisions/        lasting architecture and product decisions
└── demos/            synthetic templates, workbook, bilingual usage guides
```

Keep the core independent from infrastructure and presentation concerns. The core uses `Uint8Array`, does not access the filesystem, and does not depend on Electron. Keep Node filesystem concerns in `node-output` and adapters.

Do not introduce excessive layering merely for architectural purity. This is a small application. Prefer clear module boundaries over elaborate DDD patterns.

---

## 23. Staged Core Pipeline

Use the existing staged APIs rather than introducing another orchestration layer:

```text
prepareTemplate
    ↓
prepareGeneration (normalize input, validate formatting, plan and bind generation)
    ↓
derivePublicationManifest
    ↓
createPublicationPlan / preflightPublication (Node adapter)
    ↓
generateArtifacts
    ↓
packageArtifacts
    ↓
publishArtifacts (Node adapter)
```

Core owns in-memory DOCX/PDF generation and ZIP packaging. `node-output` owns destination resolution, filesystem conflict checks, and publication. Preflight must happen before expensive rendering. CLI dry runs stop after preflight; they do not establish PDF fidelity or rendering success.

Prepared runtime handles are opaque; serializable definitions and plans remain separate. APIs return structured `StageResult` values with errors and warnings. Diagnostics are presentation-neutral; translate or format them in adapters.

Publication uses same-directory temporary files, replacement backups, and best-effort rollback. It is not a crash-safe filesystem transaction; do not promise atomic multi-file publication.

See [staged-core-pipeline.md](docs/decisions/staged-core-pipeline.md). Do not create interfaces that have only speculative future value.

---

## 24. Docxtemplater Isolation

Docxtemplater is an implementation dependency, not the project's domain model.

Keep Docxtemplater-specific operations concentrated in a small number of modules.

Avoid exposing Docxtemplater-specific objects throughout the application.

A future replacement of the DOCX rendering implementation should not require rewriting:

* input handling,
* record models,
* output planning,
* path templates,
* path safety,
* conflict handling.

---

## 25. Desktop Application

The desktop application is the primary interaction surface.

Implemented stack:

```text
Electron
Nuxt 4 / Vue 3
TDesign
Pinia
```

Keep Electron-specific filesystem and Node capabilities outside ordinary Vue components where practical.

Prefer explicit service boundaries between:

```text
Renderer Process
IPC
Main Process / Application Core
Filesystem
```

Do not move business logic into Vue components.

The workflow is template selection, data preparation, then output configuration. Template/data/format changes invalidate affected plans and previews. Single-file mode requires exactly one record.

Settings persist interface language and type-level format defaults, not templates, records, or task history. Field-specific rules belong to the current template and clear when it changes or a new task starts.

Shared formatting supports boolean, date, datetime, and number defaults plus field rules. A field rule replaces the entire type default rather than merging it. Paths identify root fields or one-level collection children. Formatting changes rendered document text, not filenames or input values. Follow [render-formatting.md](docs/decisions/render-formatting.md).

PDF font resolution gives embedded fonts precedence. Desktop can provide requested local font faces through IPC; Node supplies a persistent remote cache and remote fallback. Do not persist local font bytes into that cache. Fonts are not bundled; uncached remote fallback requires network access. See [desktop-pdf-and-fonts.md](docs/decisions/desktop-pdf-and-fonts.md).

---

## 26. CLI

The CLI provides `inspect` and `generate`. Template inspection can export table/JSON output or CSV/XLSX input templates. Generation supports manual scalar values, CSV/XLSX, shared render options, dry runs, DOCX/PDF, and merged PDFs.

The CLI is a thin adapter around the same application services used by the desktop application.

Do not implement core business logic inside CLI command handlers.

The CLI does not need to mirror every interactive desktop feature.

It is acceptable for the CLI to focus on scripted execution using explicit arguments or configuration files.

---

## 27. Error Handling

Prefer structured application errors over raw library errors leaking directly into the UI.

Errors should identify actionable categories such as:

```text
InvalidTemplate
InvalidTemplateTag
MissingInputField
DuplicateInputField
InvalidInputValue
UnsafeOutputPath
InvalidOutputFilename
OutputConflict
RenderFailed
ArchiveFailed
UnsupportedInput
```

Exact names may evolve.

Preserve useful underlying error information for diagnostics.

Do not hide technical failures behind vague messages such as:

```text
Something went wrong.
```

---

## 28. Testing Strategy

Testing should focus heavily on real fixture files.

Maintain test fixtures for:

```text
DOCX
CSV
XLSX
```

Important cases include:

* simple string replacement,
* date and datetime fields,
* number fields,
* boolean fields,
* option fields,
* multiple template fields,
* repeated fields,
* one-level collections, ID-linked XLSX rows, and unsupported nesting,
* type defaults and complete field-format overrides,
* PDF conversion, ordered merge, and injected font providers,
* missing input columns,
* duplicate spreadsheet columns,
* reordered spreadsheet columns,
* extra spreadsheet columns,
* empty rows,
* Unicode filenames,
* invalid Windows filename characters,
* reserved Windows filenames,
* path traversal attempts,
* filename conflicts,
* directory output,
* ZIP output,
* single-record document output,
* deterministic multi-record directory and ZIP output.

For DOCX behavior, prefer integration tests using actual `.docx` fixture files instead of mocking Docxtemplater internals.

---

## 29. Coding Conventions

Use English for:

* source code,
* identifiers,
* type names,
* function names,
* comments,
* commit messages.

Desktop UI translations are English (`en-US`) and Simplified Chinese (`zh-CN`). Output formatting locales are a separate concern (`en` and `zh-CN`); do not couple interface language to document formatting.

Maintain English `README.md` and Simplified Chinese `README.zh-CN.md` at the repository root, in `apps/cli`, and in `docs/demos`. Keep commands, supported behavior, limitations, and release status aligned between translations. Other development documentation defaults to English.

Use synthetic or redacted demo/fixture data. Keep lasting decisions in `docs/decisions`; do not recreate `docs/plans` for routine execution plans.

Prefer:

* explicit TypeScript types,
* small cohesive functions,
* immutable data where practical,
* clear error types,
* minimal hidden behavior.

Avoid:

* premature abstraction,
* unnecessary dependency injection frameworks,
* large global service containers,
* speculative extensibility,
* clever metaprogramming.

---

## 30. Dependency Policy

Prefer mature, actively maintained dependencies.

Keep the dependency graph small.

Before adding a new dependency, consider whether:

1. the requirement is real,
2. the dependency meaningfully reduces implementation risk,
3. the library is actively maintained,
4. the feature can reasonably be implemented with existing dependencies.

Do not reimplement DOCX parsing/rendering manually merely to avoid a dependency.

Conversely, do not introduce a large framework for a trivial feature.

---

## 31. Maintenance and Release Priorities

Desktop and CLI already implement the end-to-end workflow. Current work should focus on release preparation, documentation, and bug fixes. Preserve existing behavior and avoid speculative feature expansion.

Use Node.js >= 24.11.0 and the root `packageManager` pnpm version. Run checks appropriate to the change; `pnpm check` combines formatting, lint, typechecking, tests, and builds. For CLI packaging changes, also run `pnpm --filter @templify/cli smoke` to check the packed and installed executable. Desktop UI changes may require the dedicated `ui:check` and manual acceptance.

The CI workflow checks pushes to `main` and pull requests on Windows and Linux, including the packed CLI smoke check. The manually triggered `Desktop package` workflow runs checks and builds an unsigned Windows x64 NSIS installer, uploading it with SHA-256 checksums and build commit information. It does not create tags or publish Releases. Signing and automatic updates are not configured. Do not describe npm packages or release installers as available until they are actually published.

Keep the root, Desktop, and CLI product versions aligned. Internal shared packages stay private and do not need independent releases. The CLI is publishable and has public npm access metadata; publication remains manual. Use `--tag preview` for preview npm releases and mark GitHub previews as pre-releases. Follow [releasing.md](docs/releasing.md), publish the exact accepted installer, and tag the recorded build commit. Do not add automatic publication or expand CI/CD unless requested.

Use `pnpm --filter @templify/desktop package:win` for local and Actions Windows x64 installer builds. This entry builds Desktop and shared packages before running electron-builder without publication.

Desktop logo sources and exported PNG/ICO assets live in `assets/logos`. Use the colored logo for the application icon, keep the PNG and ICO aligned with the SVG source, and preserve the transparent background and original aspect ratio. The window loads the PNG from repository assets during development and packaged resources after installation; Windows packaging uses the ICO for the executable, installer, and uninstaller.

Installer download, installation, and demo acceptance on the user's local machine remain release checks. A source build or unpacked packaging check does not replace them.

---

## 32. Product Principle

When deciding whether to add a feature, ask:

> Does this make filling DOCX templates from user-provided records easier or safer?

If the answer is no, the feature probably does not belong in Templify.

Templify should remain:

> A focused tool for turning DOCX templates and records into finished documents.

It should not become a general office automation platform.
