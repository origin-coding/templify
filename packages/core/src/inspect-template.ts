import Docxtemplater from 'docxtemplater';
import InspectModulePackage from 'docxtemplater/js/inspect-module.js';
import PizZip from 'pizzip';

import {
  ConflictingFieldDefinitionError,
  InvalidTemplateError,
  TemplateInspectionError,
  UnsupportedTemplateTagError,
} from './errors.js';
import type {
  CollectionFieldDefinition,
  FieldDefinition,
  FieldHint,
  ScalarFieldDefinition,
} from './field-definition.js';
import { parseCollectionTag, parseFieldTag } from './parse-field-tag.js';

interface StructuredTag {
  readonly module?: string;
  readonly raw?: string;
  readonly value: string;
  readonly inverted?: boolean;
  readonly subparsed?: readonly StructuredTag[];
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

  return collectRootDefinitions(structuredTags);
}

function collectRootDefinitions(tags: readonly StructuredTag[]): readonly FieldDefinition[] {
  const definitions: FieldDefinition[] = [];
  const definitionsByName = new Map<string, FieldDefinition>();

  for (const tag of tags) {
    const rawTag = tag.raw ?? tag.value;
    let definition: FieldDefinition;

    if (tag.module === undefined) {
      definition = parseFieldTag(tag.value);
    } else if (tag.module === 'loop') {
      definition = parseCollectionDefinition(tag, rawTag);
    } else {
      throwUnsupportedModule(rawTag, tag.module);
    }

    const existingDefinition = definitionsByName.get(definition.name);

    if (existingDefinition === undefined) {
      definitionsByName.set(definition.name, definition);
      definitions.push(definition);
      continue;
    }

    const mergedDefinition = mergeDefinitions(existingDefinition, definition, rawTag);
    definitionsByName.set(definition.name, mergedDefinition);
    definitions[definitions.indexOf(existingDefinition)] = mergedDefinition;
  }

  return definitions;
}

function parseCollectionDefinition(tag: StructuredTag, rawTag: string): CollectionFieldDefinition {
  if (tag.inverted === true) {
    throw new UnsupportedTemplateTagError(
      rawTag,
      `Template collection "${rawTag}" uses an unsupported inverted loop.`,
    );
  }

  const name = parseCollectionTag(tag.value, rawTag);
  return {
    kind: 'collection',
    name,
    fields: collectCollectionFields(tag.subparsed ?? []),
  };
}

function collectCollectionFields(tags: readonly StructuredTag[]): readonly ScalarFieldDefinition[] {
  const fields: ScalarFieldDefinition[] = [];
  const fieldsByName = new Map<string, ScalarFieldDefinition>();

  for (const tag of tags) {
    const rawTag = tag.raw ?? tag.value;

    if (tag.module === 'loop') {
      throw new UnsupportedTemplateTagError(
        rawTag,
        `Nested template collection "${rawTag}" is not supported.`,
      );
    }

    if (tag.module !== undefined) {
      throwUnsupportedModule(rawTag, tag.module);
    }

    const field = parseFieldTag(tag.value);
    const existingField = fieldsByName.get(field.name);

    if (existingField === undefined) {
      fieldsByName.set(field.name, field);
      fields.push(field);
      continue;
    }

    assertCompatibleScalarFields(existingField, field, rawTag);
  }

  return fields;
}

function mergeDefinitions(
  existing: FieldDefinition,
  next: FieldDefinition,
  rawTag: string,
): FieldDefinition {
  if (existing.kind !== next.kind) {
    throw new ConflictingFieldDefinitionError(next.name, rawTag);
  }

  if (existing.kind === 'scalar' && next.kind === 'scalar') {
    assertCompatibleScalarFields(existing, next, rawTag);
    return existing;
  }

  if (existing.kind === 'collection' && next.kind === 'collection') {
    return {
      ...existing,
      fields: mergeCollectionFields(existing.fields, next.fields, rawTag),
    };
  }

  throw new ConflictingFieldDefinitionError(next.name, rawTag);
}

function mergeCollectionFields(
  existingFields: readonly ScalarFieldDefinition[],
  nextFields: readonly ScalarFieldDefinition[],
  rawTag: string,
): readonly ScalarFieldDefinition[] {
  const mergedFields = [...existingFields];
  const fieldsByName = new Map(existingFields.map((field) => [field.name, field]));

  for (const field of nextFields) {
    const existingField = fieldsByName.get(field.name);

    if (existingField === undefined) {
      fieldsByName.set(field.name, field);
      mergedFields.push(field);
      continue;
    }

    assertCompatibleScalarFields(existingField, field, rawTag);
  }

  return mergedFields;
}

function assertCompatibleScalarFields(
  existing: ScalarFieldDefinition,
  next: ScalarFieldDefinition,
  rawTag: string,
): void {
  if (!areHintsEqual(existing.hint, next.hint)) {
    throw new ConflictingFieldDefinitionError(next.name, rawTag);
  }
}

function throwUnsupportedModule(rawTag: string, module: string): never {
  throw new UnsupportedTemplateTagError(
    rawTag,
    `Template tag "${rawTag}" uses the unsupported "${module}" tag type.`,
  );
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
