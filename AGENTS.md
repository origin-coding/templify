# AGENTS.md

## 1. Project Overview

**Templify** is a small desktop-oriented document template filling tool.

Its primary purpose is to:

1. Load and inspect a DOCX template.
2. Discover template fields and optional lightweight type hints.
3. Accept one or more records from supported input sources.
4. Render the records into DOCX output.
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
Node.js
```

DOCX rendering:

```text
Docxtemplater
PizZip
```

Desktop application, when implemented:

```text
Electron
Vue 3
TDesign
```

The desktop UI is the primary user-facing application.

A CLI may exist as a thin secondary adapter, mainly for automation, testing, and scripted usage.

The CLI must not become a separate implementation of the business logic.

Both Desktop and CLI should call the same application/core services.

---

## 4. Scope

### 4.1 Version 1 Goals

Version 1 should support:

* DOCX templates.
* Template field discovery.
* Lightweight type hints embedded in template tags.
* Manual record input.
* CSV input.
* Excel/XLSX input.
* Field matching by field name, never by column order.
* Rendering one or more records.
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

Initial supported hints should remain small:

```text
string
number
boolean
date
option[...]
```

A future `datetime` type may be added if needed.

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

A field model can conceptually resemble:

```ts
type FieldHint =
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "date" }
  | { type: "option"; values: string[] };

interface FieldDefinition {
  name: string;
  hint: FieldHint;
}
```

This is illustrative rather than a mandatory exact implementation.

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
type PrimitiveValue =
  | string
  | number
  | boolean
  | Date
  | null;

type RecordData = Record<string, PrimitiveValue>;
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

All input sources should eventually normalize into the same:

```text
RecordData[]
```

representation.

The renderer must not need to know whether records originated from the UI, CLI, CSV, or Excel.

---

## 12. Manual Input

Manual input is intended for small datasets.

The desktop UI may dynamically generate controls based on discovered template fields and type hints.

Examples:

```text
string  -> text input
number  -> numeric input
boolean -> checkbox/switch
date    -> date picker
option  -> select
```

The CLI, if implemented, should remain simple.

Do not build an interactive terminal UI unless a real requirement appears.

---

## 13. CSV Input

CSV columns are matched to template fields **by name**.

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

---

## 15. File Input Validation

Recommended behavior:

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

Optionally expose a warning in the UI.

### Empty rows

```text
Ignore
```

Avoid positional matching.

---

## 16. Rendering Modes

Rendering has two fundamentally different semantics.

### 16.1 Single Document

Multiple records are rendered into one DOCX.

Example:

```text
Record[]
    ↓
one render operation
    ↓
output.docx
```

The template itself should explicitly define how records repeat, for example using a Docxtemplater loop:

```text
{#records}

{name}
{department}

... page break ...

{/records}
```

Templify should not silently rewrite a template to wrap it in an implicit records loop.

The template must express multi-record structure explicitly.

This mode is especially useful for printing many forms at once.

---

### 16.2 Multiple Documents

Each record produces one document.

Example:

```text
Record 1 -> document 1
Record 2 -> document 2
Record 3 -> document 3
```

Each document can then be written to:

* a directory, or
* an archive.

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

---

## 18. Path Templates

Directory and archive modes may support user-defined output path templates.

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

The tool should not silently overwrite an existing file unless the user explicitly selected overwrite behavior.

Automatic renaming such as:

```text
file.docx
file (2).docx
file (3).docx
```

is a possible future enhancement but is not required for version 1.

---

## 22. Architecture Direction

Keep the core independent from infrastructure and presentation concerns.

A reasonable conceptual structure is:

```text
src/
├── application/
├── template/
├── record/
├── render/
├── output/
├── input/
├── cli/
└── desktop/
```

The exact layout may evolve.

Do not introduce excessive layering merely for architectural purity.

This is a small application.

Prefer clear module boundaries over elaborate DDD patterns.

---

## 23. Suggested Core Abstractions

Possible boundaries include:

```ts
interface TemplateInspector {
  inspect(template: Buffer): Promise<FieldDefinition[]>;
}

interface DocumentRenderer {
  render(
    template: Buffer,
    context: Record<string, unknown>
  ): Promise<Buffer>;
}
```

Input sources conceptually produce:

```ts
RecordData[]
```

Output strategies consume rendered documents.

For example:

```text
ManualInputSource
CsvInputSource
ExcelInputSource
        ↓
    RecordData[]
        ↓
    RenderPlanner
        ↓
 DocumentRenderer
        ↓
 RenderedDocument[]
        ↓
 DirectoryOutputWriter / ArchiveOutputWriter
```

These interfaces are guidelines, not mandatory abstractions.

Do not create interfaces that have only speculative future value.

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

Planned stack:

```text
Electron
Vue 3
TDesign
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

---

## 26. CLI

CLI support is optional but should remain possible.

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
* date fields,
* number fields,
* boolean fields,
* option fields,
* multiple template fields,
* repeated fields,
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
* single-document multi-record rendering.

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

User-facing localization strategy can be decided separately.

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

## 31. Development Priorities

The initial end-to-end milestone should be:

```text
template.docx
    ↓
inspect fields
    ↓
create one record
    ↓
render
    ↓
output.docx
```

After this works reliably, expand incrementally:

```text
multiple records
→ single-document rendering
→ directory output
→ archive output
→ CSV input
→ Excel input
→ desktop UI
→ optional CLI
```

Prefer working vertical slices over implementing all abstractions before the first rendered document exists.

---

## 32. Product Principle

When deciding whether to add a feature, ask:

> Does this make filling DOCX templates from user-provided records easier or safer?

If the answer is no, the feature probably does not belong in Templify.

Templify should remain:

> A focused tool for turning DOCX templates and records into finished documents.

It should not become a general office automation platform.
