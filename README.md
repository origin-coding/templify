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

See [the staged pipeline decision](./docs/decisions/staged-core-pipeline.md) for the responsibility boundaries and public flow.

## Development

Requirements:

- Node.js 24 or later.
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

## Contributing

Repository content, source code, comments, issues, pull requests, and commit messages use English. See [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting changes.

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
