# Templify logos

`templify-logo-colored.svg` is the source artwork for the Desktop icon.
`templify-logo-monochrome.svg` is an alternative for monochrome use.

The committed Desktop assets are exports of the colored SVG, preserving its
aspect ratio and centering it on a transparent square canvas:

- `templify-icon.png`: 1024 × 1024, used by the Electron window in development
  and copied into the packaged application's resources.
- `templify-icon.ico`: 16, 24, 32, 48, 64, 128, and 256 pixel frames, used by
  the Windows executable, shortcuts, installer, and uninstaller.

When changing the source artwork, regenerate both exported files and verify the
16 and 32 pixel appearance as well as the packaged Windows application.
