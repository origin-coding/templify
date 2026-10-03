# Contributing

Thank you for contributing to Templify.

## Language

Use English for source code, identifiers, comments, development documentation, commit messages, issues, and pull requests. Maintain paired English `README.md` and Simplified Chinese `README.zh-CN.md` files at the repository root, in `apps/cli`, and in `docs/demos`; update both versions when behavior or instructions change.

## Development setup

1. Install Node.js 24.11.0 or later and pnpm 11, using the version pinned in the root `packageManager` field.
2. Run `pnpm install`.
3. Run `pnpm check` before opening a pull request.

## Scope

Keep changes focused on making DOCX template filling from user-provided records easier or safer. Avoid introducing speculative infrastructure or expanding Templify into a general office automation platform.

## Fixtures and privacy

Do not commit confidential documents or real business records. Use minimal, synthetic, or redacted DOCX, CSV, and XLSX fixtures.
