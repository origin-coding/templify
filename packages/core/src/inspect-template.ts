import Docxtemplater from 'docxtemplater';
import InspectModulePackage from 'docxtemplater/js/inspect-module.js';
import PizZip from 'pizzip';

import {
  ConflictingFieldDefinitionError,
  InvalidTemplateError,
  TemplateInspectionError,
  UnsupportedTemplateTagError,
} from './errors.js';
import type { FieldDefinition, FieldHint } from './field-definition.js';
import { parseFieldTag } from './parse-field-tag.js';

interface StructuredTag {
  readonly module?: string;
  readonly raw?: string;
  readonly value: string;
}

interface InspectModuleInstance {
  getStructuredTags(): StructuredTag[];
}

const InspectModule = InspectModulePackage as unknown as new () => InspectModuleInstance;

export function inspectTemplate(template: Buffer): readonly FieldDefinition[] {
  let structuredTags: readonly StructuredTag[];

  try {
    const zip = new PizZip(template);
    const inspectModule = new InspectModule();

    const compiledTemplate = new Docxtemplater(zip, {
      errorLogging: false,
      modules: [inspectModule],
    });

    structuredTags = inspectModule.getStructuredTags();
    void compiledTemplate;
  } catch (cause) {
    if (cause instanceof TemplateInspectionError) {
      throw cause;
    }

    throw new InvalidTemplateError('The DOCX template could not be loaded or compiled.', { cause });
  }

  return collectFieldDefinitions(structuredTags);
}

function collectFieldDefinitions(tags: readonly StructuredTag[]): readonly FieldDefinition[] {
  const fields: FieldDefinition[] = [];
  const fieldsByName = new Map<string, FieldDefinition>();

  for (const tag of tags) {
    const rawTag = tag.raw ?? tag.value;

    if (tag.module) {
      throw new UnsupportedTemplateTagError(
        rawTag,
        `Template tag "${rawTag}" uses the unsupported "${tag.module}" tag type.`,
      );
    }

    const field = parseFieldTag(tag.value);
    const existingField = fieldsByName.get(field.name);

    if (existingField === undefined) {
      fieldsByName.set(field.name, field);
      fields.push(field);
      continue;
    }

    if (!areHintsEqual(existingField.hint, field.hint)) {
      throw new ConflictingFieldDefinitionError(field.name, rawTag);
    }
  }

  return fields;
}

function areHintsEqual(left: FieldHint, right: FieldHint): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type !== 'option' || right.type !== 'option') {
    return true;
  }

  return (
    left.values.length === right.values.length &&
    left.values.every((value, index) => value === right.values[index])
  );
}
