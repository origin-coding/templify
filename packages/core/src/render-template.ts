import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import {
  DocumentRenderError,
  InvalidInputValueError,
  MissingInputFieldError,
  RenderFailedError,
  TemplateInspectionError,
} from './errors.js';
import type { FieldDefinition } from './field-definition.js';
import { formatFieldValue } from './format-field-value.js';
import { inspectTemplate } from './inspect-template.js';
import { parseFieldTag } from './parse-field-tag.js';
import type { RecordData } from './record-data.js';

type RenderContext = Readonly<Record<string, string>>;

export function renderTemplate(template: Buffer, record: RecordData): Buffer {
  try {
    const fields = inspectTemplate(template);
    const context = createRenderContext(fields, record);
    const zip = new PizZip(template);
    const document = new Docxtemplater(zip, {
      errorLogging: false,
      parser: (tag) => {
        const field = parseFieldTag(tag);

        return {
          get(scope: RenderContext): string | undefined {
            return scope[field.name];
          },
        };
      },
    });

    document.render(context);
    return document.getZip().generate({ type: 'nodebuffer' });
  } catch (cause) {
    if (cause instanceof TemplateInspectionError || cause instanceof DocumentRenderError) {
      throw cause;
    }

    throw new RenderFailedError(undefined, { cause });
  }
}

function createRenderContext(
  fields: readonly FieldDefinition[],
  record: RecordData,
): RenderContext {
  const context: Record<string, string> = {};

  for (const field of fields) {
    if (!Object.hasOwn(record, field.name)) {
      throw new MissingInputFieldError(field.name);
    }

    const value = record[field.name];

    if (value === undefined) {
      throw new InvalidInputValueError(
        field.name,
        `Field "${field.name}" cannot contain undefined. Use null for an empty value.`,
      );
    }

    context[field.name] = formatFieldValue(field, value);
  }

  return context;
}
