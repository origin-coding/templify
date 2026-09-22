# Decision: Use a staged, in-memory core pipeline with separate Node publication

- Status: Accepted
- Date: 2026-09-22

## Context

The original core exposed separate orchestration functions for single files, directories, archives, and PDF output. Template inspection, input conversion, render planning, rendering, and filesystem output were consequently spread across a flat module layout. CLI and Desktop need the same domain behavior, but they have different selection, localization, confirmation, and final-output responsibilities.

## Decision

The application flow is divided into explicit domain stages:

```text
prepareTemplate
  -> prepareGeneration
       -> normalize input
       -> validate render options
       -> create generation plan
       -> bind Generation
  -> derivePublicationManifest
  -> createPublicationPlan
  -> preflightPublication
  -> generateArtifacts
  -> packageArtifacts
  -> publishArtifacts
```

Core stages return `StageResult<T, E, W>` with I18n-neutral diagnostic data. A successful stage may include warnings because recoverable technical conditions, such as ignored extra columns, sanitized dynamic path values, or PDF conversion losses, should not discard a valid result.

`TemplateDefinition` and `GenerationPlan` are serializable domain models. `PreparedTemplate` and `Generation` are opaque runtime values. Template inspection occurs once; rendering creates a fresh mutable DOCX package for every record.

Core accepts raw unknown object rows or an adapter-produced tabular representation and normalizes them into one record model. CSV and XLSX parsing remain adapter responsibilities. Core renders and packages `Uint8Array` artifacts entirely in memory. It does not choose an output directory, inspect existing files, request overwrite confirmation, or write final files.

The `@templify/node-output` package owns publication in three stages:

- `plan` creates a serializable, side-effect-free publication plan.
- `preflight` reads filesystem state and records the expected targets.
- `publish` performs the only filesystem mutations after caller confirmation.

Overwrite publication uses same-directory temporary files and temporary backups. A failed run removes files it created and attempts to restore overwritten targets. This is best-effort recovery, not a durable transaction or crash-recovery journal.

## Consequences

- Desktop and CLI can share inspection, normalization, planning, rendering, PDF conversion, merging boundaries, and packaging without sharing presentation logic.
- Diagnostics contain codes, field paths, zero-based programmatic indexes, and optional one-based source row numbers; adapters own localized messages.
- PDF-only generation keeps its canonical DOCX path and intermediate DOCX bytes in memory. Published PDF names replace only the terminal `.docx` extension.
- Merged PDFs are aggregate derivative artifacts over generated PDFs in accepted plan order. `PdfMerger` remains injectable, with `@cantoo/pdf-lib` as the default in-memory page-copy implementation.
- ZIP packaging remains in core because it transforms in-memory artifacts; writing the ZIP remains a Node publication concern.
- The old pre-release APIs are removed rather than wrapped. Barrel modules only expose cohesive public boundaries and do not introduce forwarding service layers.

## Alternatives considered

- Effect and Layer were rejected because the project does not need a runtime dependency graph or the associated conversion and learning overhead.
- Letting core write final files was rejected because output roots, conflict confirmation, permissions, and cleanup are application/infrastructure concerns.
- A one-call filesystem pipeline was rejected because it would hide the confirmation boundary between preflight and mutation.
- Full transactional publication and crash recovery were rejected as disproportionate for this utility.

## References

- [Issue #10: Adopt independent DOCX output and derivative PDF pipeline](https://github.com/origin-coding/templify/issues/10)
- [Issue #11: Add derivative PDF output, merged print PDF, Desktop preview and printing](https://github.com/origin-coding/templify/issues/11)
- [Issue #21: Use ReamKit for derivative PDF generation](https://github.com/origin-coding/templify/issues/21)
