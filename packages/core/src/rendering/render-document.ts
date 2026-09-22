import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import type { RecordData, ScalarValue } from '@/input/record-data.js';
import { copyPreparedTemplateSource, type PreparedTemplate } from '@/template/prepared-template.js';
import { parseFieldTag } from '@/template/parse-field-tag.js';
import type {
  CollectionFieldDefinition,
  FieldDefinition,
  ScalarFieldDefinition,
} from '@/template/field-definition.js';
import type { DocumentRenderError } from './rendering-diagnostics.js';
import { createFieldValueFormatter, type FieldValueFormatter } from './field-value-formatter.js';
import type { ValidatedRenderOptions } from './validated-render-options.js';

type FormattedFlatRecord = Readonly<Record<string, string>>;
type RenderValue = string | readonly FormattedFlatRecord[];
type RenderContext = Readonly<Record<string, RenderValue>>;

export class DocumentRenderFailure extends Error {
  readonly issue: DocumentRenderError;
  constructor(issue: DocumentRenderError, options: ErrorOptions = {}) {
    super(issue.code, options);
    this.name = new.target.name;
    this.issue = issue;
  }
}

export function renderDocument(
  template: PreparedTemplate,
  data: RecordData,
  options: ValidatedRenderOptions,
  formatter: FieldValueFormatter = createFieldValueFormatter(options),
): Uint8Array {
  try {
    const context = createRenderContext(template.definition.fields, data, formatter);
    const zip = new PizZip(copyPreparedTemplateSource(template));
    const document = new Docxtemplater(zip, {
      errorLogging: false,
      parser: (tag) => {
        const field = parseFieldTag(tag);
        return {
          get(scope: RenderContext | FormattedFlatRecord): RenderValue | undefined {
            return scope[field.name];
          },
        };
      },
    });
    document.render(context);
    return document.getZip().generate({ type: 'uint8array' });
  } catch (cause) {
    if (cause instanceof DocumentRenderFailure) throw cause;
    throw new DocumentRenderFailure({ code: 'RenderFailed' }, { cause });
  }
}

function createRenderContext(
  fields: readonly FieldDefinition[],
  data: RecordData,
  formatter: FieldValueFormatter,
): RenderContext {
  const context: Record<string, RenderValue> = {};
  for (const field of fields) {
    if (!Object.hasOwn(data, field.name)) {
      throw new DocumentRenderFailure({ code: 'MissingInputField', dataPath: [field.name] });
    }
    const value = data[field.name];
    context[field.name] =
      field.kind === 'scalar'
        ? formatScalar(field, value, [field.name], formatter)
        : formatCollection(field, value, formatter);
  }
  return context;
}

function formatScalar(
  field: ScalarFieldDefinition,
  value: unknown,
  dataPath: readonly [string],
  formatter: FieldValueFormatter,
): string {
  if (!isScalarValue(value)) {
    throw new DocumentRenderFailure({
      code: 'InvalidInputValue',
      dataPath,
      reason: 'InvalidScalarValue',
    });
  }
  return formatter.format(field, value, [field.name]);
}

function formatCollection(
  collection: CollectionFieldDefinition,
  value: unknown,
  formatter: FieldValueFormatter,
): readonly FormattedFlatRecord[] {
  if (!Array.isArray(value)) {
    throw new DocumentRenderFailure({
      code: 'InvalidInputValue',
      dataPath: [collection.name],
      reason: 'InvalidCollectionValue',
    });
  }
  return value.map((candidate, itemIndex) => {
    if (!isPlainRecord(candidate)) {
      throw new DocumentRenderFailure({
        code: 'InvalidInputValue',
        dataPath: [collection.name, itemIndex],
        reason: 'InvalidCollectionItem',
      });
    }
    const item: Record<string, string> = {};
    for (const field of collection.fields) {
      const dataPath = [collection.name, itemIndex, field.name] as const;
      if (!Object.hasOwn(candidate, field.name)) {
        throw new DocumentRenderFailure({ code: 'MissingInputField', dataPath });
      }
      const child = candidate[field.name];
      if (!isScalarValue(child)) {
        throw new DocumentRenderFailure({
          code: 'InvalidInputValue',
          dataPath,
          reason: 'InvalidScalarValue',
        });
      }
      item[field.name] = formatter.format(field, child, [collection.name, field.name]);
    }
    return item;
  });
}

function isScalarValue(value: unknown): value is ScalarValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
