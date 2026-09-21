import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import {
  DocumentRenderError,
  InvalidInputValueError,
  MissingInputFieldError,
  RenderFailedError,
  TemplateInspectionError,
} from './errors.js';
import type {
  CollectionFieldDefinition,
  FieldDefinition,
  ScalarFieldDefinition,
} from './field-definition.js';
import { formatFieldValue } from './format-field-value.js';
import { inspectTemplate } from './inspect-template.js';
import { parseFieldTag } from './parse-field-tag.js';
import type { PrimitiveValue, RecordData } from './record-data.js';

type DataPath = readonly (string | number)[];
type FormattedFlatRecord = Readonly<Record<string, string>>;
type RenderValue = string | readonly FormattedFlatRecord[];
type RenderContext = Readonly<Record<string, RenderValue>>;

export function renderTemplate(template: Buffer, data: RecordData): Buffer {
  try {
    const fields = inspectTemplate(template);
    const context = createRenderContext(fields, data);
    const zip = new PizZip(template);
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
    return document.getZip().generate({ type: 'nodebuffer' });
  } catch (cause) {
    if (cause instanceof TemplateInspectionError || cause instanceof DocumentRenderError) {
      throw cause;
    }

    throw new RenderFailedError(undefined, { cause });
  }
}

function createRenderContext(fields: readonly FieldDefinition[], data: RecordData): RenderContext {
  const context: Record<string, RenderValue> = {};

  for (const field of fields) {
    const dataPath = [field.name] satisfies DataPath;
    const value = getRequiredValue(
      data,
      field.name,
      dataPath,
      field.kind === 'scalar' ? 'MissingScalarField' : 'MissingCollection',
    );

    context[field.name] =
      field.kind === 'scalar'
        ? formatScalarField(field, value, dataPath)
        : formatCollection(field, value, dataPath);
  }

  return context;
}

function formatScalarField(
  field: ScalarFieldDefinition,
  value: unknown,
  dataPath: DataPath,
): string {
  if (!isPrimitiveValue(value)) {
    throw new InvalidInputValueError(
      field.name,
      `Field "${formatDataPath(dataPath)}" must contain a scalar value.`,
      { dataPath, reason: 'InvalidScalarValue' },
    );
  }

  return formatFieldValue(field, value, dataPath, 'InvalidScalarValue');
}

function formatCollection(
  field: CollectionFieldDefinition,
  value: unknown,
  dataPath: DataPath,
): readonly FormattedFlatRecord[] {
  if (!Array.isArray(value)) {
    throw new InvalidInputValueError(
      field.name,
      `Field "${formatDataPath(dataPath)}" must contain an array of records.`,
      { dataPath, reason: 'InvalidCollectionValue' },
    );
  }

  return value.map((item, itemIndex) => {
    const itemPath = [...dataPath, itemIndex];

    if (!isPlainRecord(item)) {
      throw new InvalidInputValueError(
        field.name,
        `Collection item "${formatDataPath(itemPath)}" must be a plain record.`,
        { dataPath: itemPath, reason: 'InvalidCollectionItem' },
      );
    }

    return formatCollectionItem(field, item, itemPath);
  });
}

function formatCollectionItem(
  collection: CollectionFieldDefinition,
  item: Readonly<Record<string, unknown>>,
  itemPath: DataPath,
): FormattedFlatRecord {
  const formattedItem: Record<string, string> = {};

  for (const field of collection.fields) {
    const dataPath = [...itemPath, field.name];
    const value = getRequiredValue(item, field.name, dataPath, 'MissingCollectionItemField');

    if (!isPrimitiveValue(value)) {
      throw new InvalidInputValueError(
        field.name,
        `Field "${formatDataPath(dataPath)}" must contain a scalar value; nested collections are not supported.`,
        { dataPath, reason: 'InvalidCollectionItemValue' },
      );
    }

    formattedItem[field.name] = formatFieldValue(
      field,
      value,
      dataPath,
      'InvalidCollectionItemValue',
    );
  }

  return formattedItem;
}

function getRequiredValue(
  data: Readonly<Record<string, unknown>>,
  fieldName: string,
  dataPath: DataPath,
  missingReason: 'MissingScalarField' | 'MissingCollection' | 'MissingCollectionItemField',
): unknown {
  if (!Object.hasOwn(data, fieldName)) {
    throw new MissingInputFieldError(fieldName, {
      dataPath,
      reason: missingReason,
    });
  }

  const value = data[fieldName];

  if (value === undefined) {
    throw new InvalidInputValueError(
      fieldName,
      `Field "${formatDataPath(dataPath)}" cannot contain undefined. Use null for an empty scalar value.`,
      {
        dataPath,
        reason:
          missingReason === 'MissingCollection'
            ? 'InvalidCollectionValue'
            : missingReason === 'MissingCollectionItemField'
              ? 'InvalidCollectionItemValue'
              : 'InvalidScalarValue',
      },
    );
  }

  return value;
}

function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function formatDataPath(dataPath: DataPath): string {
  return dataPath
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${part}`,
    )
    .join('');
}
