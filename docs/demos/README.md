# Demo templates

[English](README.md) | [简体中文](README.zh-CN.md)

These English-language examples use a fictional Northfield Community Workshop.
Open a DOCX template in Templify, prepare its records, and generate the documents.

| File                                                     | Purpose                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| [workshop-registration.docx](workshop-registration.docx) | Manual input with string, date, number, and boolean fields. |
| [equipment-checkout.docx](equipment-checkout.docx)       | A checkout form with a repeating equipment table.           |
| [equipment-checkout.xlsx](equipment-checkout.xlsx)       | Two checkout records and their equipment items.             |

## Workshop registration

Use these values for a first manual record:

| Field                | Value                           |
| -------------------- | ------------------------------- |
| `participantName`    | Alex Morgan                     |
| `registrationId`     | 001234                          |
| `workshopTitle`      | Introduction to Urban Gardening |
| `workshopDate`       | 2026-11-06                      |
| `seatCount`          | 2                               |
| `materialsRequested` | true                            |

Keep `registrationId` as text so its leading zeros are preserved. The participant
name appears twice in the template. Configure boolean formatting as `Yes` / `No`
and date formatting as `YYYY-MM-DD` for a readable confirmation.

For a batch demonstration, add another record, or export an input spreadsheet
from the template and fill it with the same field names.

## Equipment checkout

Load `equipment-checkout.docx`, choose Excel input, and import
`equipment-checkout.xlsx`. Select `checkouts` as the root worksheet if prompted.

The workbook contains only two data worksheets, with field names in the first row:

- `checkouts`: two root records, identified by the text values `r1` and `r2` in
  `__templify_id`.
- `items`: five equipment items, linked to their root records by
  `__templify_parent_id`. Its name matches the template's `{#items}...{/items}` loop.

Dates are native Excel dates, quantities are numbers, and `conditionChecked`
contains native boolean values. IDs and asset codes are text. Configure boolean
formatting as `Yes` / `No` and date formatting as `YYYY-MM-DD` before generating.

Choose directory or ZIP output and use `{checkoutId}.docx` as the path template:

| Output        | Borrower    | Equipment rows |
| ------------- | ----------- | -------------- |
| `EC-001.docx` | Alex Morgan | 3              |
| `EC-002.docx` | Jamie Lee   | 2              |

Each root record produces one document. Collection items repeat rows within that
document; they do not create additional documents. Sorting rows does not change
the ID-based relationships. Keep worksheet names, column names, and relationship
IDs intact when editing the example. CSV input does not support collections.
