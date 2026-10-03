# Releasing Templify

Versions and publication are controlled manually. GitHub Actions checks the repository
and builds the Windows x64 NSIS installer on demand. CLI publication uses npm locally.

## Prepare the version

1. Update `version` in the root, `apps/desktop`, and `apps/cli` `package.json` files to
   the same product version. Internal workspace packages stay private and do not
   need separate releases.
2. Use a prerelease version such as `1.0.0-preview.0` for a preview, or `1.0.0` for
   a stable release. Increment the preview suffix for another published preview.
3. Run `pnpm check` and `pnpm --filter @origin-coding/templify smoke`.
4. Commit the changes and merge the release preparation into `main`.

Never change the contents of an already published version. Use a new version for fixes.

## Build and accept Desktop

To build an installer locally on Windows, run from the repository root:

```shell
pnpm --filter @templify/desktop package:win
```

This entry builds Desktop and its shared packages, then creates the Windows x64
NSIS installer in `apps/desktop/release/`. The Actions workflow uses the same entry.
Publication is a separate manual step.

1. On GitHub, open **Actions → Desktop package → Run workflow** and select `main`.
   The workflow must be merged into the default branch for this button to appear.
2. Wait for the checks and packaging to pass, then download and extract the
   `Templify-<version>-windows-x64-<run>-<attempt>` artifact. Artifacts are retained
   for 30 days; a published Release retains its uploaded assets independently.
3. Keep the installer, `SHA256SUMS.txt`, and `build-info.json` together. The build
   information records the exact commit to release. Compare the installer's hash
   with the checksum file, for example in PowerShell:

   ```powershell
   Get-FileHash ./Templify-1.0.0-windows-x64-setup.exe -Algorithm SHA256
   ```

4. Install and launch the downloaded installer on a Windows x64 computer. Run both
   [demo templates](demos/README.md), including the ID-linked collection workbook.
   Check manual input, XLSX import, DOCX output, PDF preview/export, directory/ZIP
   output, overwrite confirmation, and both interface languages. Review DOCX/PDF
   content and layout. Also check uninstalling the application.

The installer is unsigned; Windows may show an unknown-publisher or SmartScreen
prompt. Packaging success does not replace installation and demo acceptance.

## Publish a GitHub Release

After acceptance, create a tag such as `v1.0.0` at the **commit recorded
in `build-info.json`**, rather than at whatever commit is now the tip of `main`.
Create a GitHub Release from that tag and upload the exact installer you tested,
along with its checksum and build information. Describe the changes and relevant
limitations. For preview versions, select **Set as a pre-release**.
For stable versions, leave the pre-release setting off.

The packaging workflow does not create tags or Releases. It needs no publishing
secrets and has only read access to repository contents.

## Publish the CLI manually

Use a clean checkout of the same release commit with Node.js >= 24.11.0 and the
root `packageManager` pnpm version. The public CLI package is
`@origin-coding/templify`, owned by the npm user `origin-coding`; a separate npm
organization is not required. Internal `@templify/*` workspace packages remain
private. Build and check the package:

```shell
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @origin-coding/templify smoke
pnpm --filter @origin-coding/templify exec npm publish --dry-run --access public --tag latest
```

Inspect the dry-run package contents and metadata. Actual publication is performed
by the maintainer in an interactive terminal, completing npm's authentication and
2FA prompts. Agents prepare and verify the package but do not run the actual
publishing command or automate authentication. The maintainer runs:

```shell
npm login
npm whoami
pnpm --filter @origin-coding/templify exec npm publish --access public --tag latest
```

Confirm that `npm whoami` returns `origin-coding` before publishing. Keep the
account's interactive publishing requirements enabled; do not add publishing
tokens or automatic npm publication to Actions.

Always pass `--tag preview` for preview releases so they do not replace `latest`.
For a stable release, use `--tag latest` as above. Desktop and CLI are published
separately; completing one does not publish the other.

After publication, install and verify the published executable:

```shell
npm install --global @origin-coding/templify@1.0.0
templify --version
templify --help
```

Run the [CLI demo commands](../apps/cli/README.md) with the installed package.
