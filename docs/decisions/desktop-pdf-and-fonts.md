# Decision: Desktop PDF preview and shared font fallback

- Status: Accepted
- Date: 2026-10-02

## Output selection

Desktop and CLI select one per-record format: DOCX or PDF. Directory and ZIP
outputs can additionally include a merged PDF in accepted record order. The
user-facing combinations are DOCX with an optional merged PDF, or PDF with an
optional merged PDF. Neither adapter offers simultaneous individual DOCX and
PDF export. Single-file output accepts one record and one selected format.

Desktop PDF preview is optional and precedes publication. It supports a selected
record or all records merged into one PDF, without requiring an output location.
The all-record preview action belongs above the record list or imported table;
individual preview actions belong to the current record. Data or template changes
invalidate the preview. PDF previews and exports may contain font, formatting,
or pagination errors, including with embedded fonts. Fidelity is not guaranteed;
the final rendered DOCX remains authoritative. A persistent warning is shown in
the preview dialog and when PDF or merged PDF output is selected.

The visible preview uses `@embedpdf/vue-pdf-viewer` in a Vue dialog, with its
PDFium WASM packaged locally. Conversion-loss diagnostics remain available from
the application service but are represented in the UI by one global PDF notice,
not repeated per-record alerts. Viewer editing and document-opening features are
disabled. Direct printing is removed: unavailable network printer drivers can block
native dialog initialization and leave retries failing after cancellation. The
application does not maintain a hidden PDF window or a printing IPC API. Opening
an unpublished preview in an external PDF application remains a separate decision.

After publication, single-file output offers Open file and Show in folder;
directory output offers Open output directory; ZIP offers Show in folder.

## Font resolution

Font orchestration belongs in the PDF submodule of `@templify/node-output`.
It does not depend on Electron or Chromium. The converter accepts externally
provided font data through a small callback.

- CLI: persistent remote font cache, then ReamKit-compatible remote fallback.
- Desktop: Chromium Local Font Access, then the same persistent remote cache
  and remote fallback.
- Fonts already embedded in the DOCX retain precedence.
- Renderer enumerates font metadata and reads only requested font faces. Only
  those bytes and their family/style identity cross IPC to Main.
- System fonts are never written to the remote cache. They can be reused in
  memory during the task. Embedding-restricted or unreadable faces fall back.
- Local access denial, missing local faces, cache read failures, and cache write
  failures are recoverable. Successfully downloaded bytes remain usable even
  when persistence fails. Failed downloads can be retried.
- Conversion fails if no available font can draw required text. Ordinary
  substitution and layout differences remain warnings rather than fatal errors.

ReamKit 1.29's provider chain does not pass a family name. The Node adapter uses
the public resolved document model, font registries, and conversion options to
provide exact-family local fonts and glyph fallback. It does not scan DOCX XML.
The remote fallback catalogue follows ReamKit 1.29 and its cache namespace is
versioned. A checksum detects corrupt persistent entries.

Fonts are not bundled and there are no user-facing font strategy settings.
Uncached remote fonts require network access. Split out `packages/pdf-fonts`
only if additional backends, PDF engines, or font-management complexity warrant it.

Shared render options are implemented in Desktop and CLI; see
[render-formatting.md](render-formatting.md).
