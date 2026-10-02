# Shared rendering format configuration

CLI and Desktop use the same `RenderOptions` validation and formatting in core.
Formatting changes document text, not normalized record data or input controls.
PDF previews and PDF exports derive from the same formatted DOCX.

## Scope and precedence

1. A rule in `formats` applies to one scalar field or collection child.
2. Otherwise, `defaults` applies to all fields of the corresponding type.
3. Otherwise, the existing canonical core format applies.

A field rule replaces the entire type default, rather than merging individual
properties. This allows a number field to omit a currency configured globally.
Removing the rule restores inheritance. Null values still render as empty text.
String and option fields have no formatting rules.

## CLI

Use `--render-options <file.json>` with `generate`. The configuration file is
protected against being overwritten by generated output. Invalid JSON or format
rules fail before publication, including with `--dry-run`.

```json
{
  "locale": "zh-CN",
  "timeZone": "Asia/Shanghai",
  "defaults": {
    "boolean": { "trueText": "是", "falseText": "否" },
    "date": { "pattern": "YYYY年MM月DD日" },
    "number": {
      "useGrouping": true,
      "minimumFractionDigits": 2,
      "maximumFractionDigits": 2
    }
  },
  "formats": [
    {
      "path": ["approved"],
      "format": { "type": "boolean", "trueText": "通过", "falseText": "未通过" }
    },
    {
      "path": ["items", "amount"],
      "format": { "type": "number", "currency": "CNY", "currencyDisplay": "code" }
    }
  ]
}
```

Only `en` and `zh-CN` formatting locales are supported. Interface language and
document formatting language are separate. Dates represent calendar dates;
datetime formatting uses an IANA time zone, or the runtime zone when omitted.

## Desktop

Application Settings contains type defaults. Apply validates and persists them
in the existing `userData/settings/settings.json` alongside language preferences.
Old language-only settings remain valid. Fresh installations retain core defaults.

Prepare Data contains field rules for the current template, including collection
children. These survive step and input-source changes but are cleared when the
template changes or a new task starts. They are not saved in application settings.

The main process produces examples with the same core formatter used for output.
Changing applied settings invalidates PDF previews and output plans. Editing a
panel draft does not change output until Apply is selected.

JSON import/export in Desktop and automatic per-template rule persistence are
deferred.
