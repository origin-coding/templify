import Docxtemplater from 'docxtemplater';
import InspectModulePackage from 'docxtemplater/js/inspect-module.js';
import PizZip from 'pizzip';

import type { StageResult } from '@/stage-result.js';
import { createPreparedTemplate, type PreparedTemplate } from './prepared-template.js';
import { parseCollectionTag, parseFieldTag, TemplateTagFailure } from './parse-field-tag.js';
import type { TemplatePreparationError } from './template-diagnostics.js';
import type { TemplateDefinition } from './template-definition.js';
import type {
  CollectionFieldDefinition,
  FieldDefinition,
  FieldHint,
  ScalarFieldDefinition,
} from './field-definition.js';

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

export type PrepareTemplateResult = StageResult<PreparedTemplate, TemplatePreparationError>;

export function prepareTemplate(source: Uint8Array): PrepareTemplateResult {
  try {
    const zip = new PizZip(source);
    const inspectModule = new InspectModule();
    void new Docxtemplater(zip, { errorLogging: false, modules: [inspectModule] });
    const definition: TemplateDefinition = {
      version: 1,
      kind: 'docx',
      fields: collectRootDefinitions(inspectModule.getStructuredTags()),
    };
    return { ok: true, value: createPreparedTemplate(source, definition), warnings: [] };
  } catch (cause) {
    const issue =
      cause instanceof TemplateTagFailure
        ? cause.issue
        : ({ code: 'InvalidTemplate', reason: 'CompileFailed' } as const);
    return { ok: false, errors: [issue], warnings: [] };
  }
}

function collectRootDefinitions(tags: readonly StructuredTag[]): readonly FieldDefinition[] {
  const definitions: FieldDefinition[] = [];
  const definitionsByName = new Map<string, FieldDefinition>();

  for (const tag of tags) {
    const rawTag = tag.raw ?? tag.value;
    const definition =
      tag.module === undefined
        ? parseFieldTag(tag.value)
        : tag.module === 'loop'
          ? parseCollectionDefinition(tag, rawTag)
          : unsupportedModule(rawTag, tag.module);
    const existing = definitionsByName.get(definition.name);
    if (existing === undefined) {
      definitionsByName.set(definition.name, definition);
      definitions.push(definition);
      continue;
    }
    const merged = mergeDefinitions(existing, definition, rawTag);
    definitionsByName.set(definition.name, merged);
    definitions[definitions.indexOf(existing)] = merged;
  }
  return definitions;
}

function parseCollectionDefinition(tag: StructuredTag, rawTag: string): CollectionFieldDefinition {
  if (tag.inverted === true) {
    throw new TemplateTagFailure({
      code: 'UnsupportedTemplateTag',
      reason: 'InvertedCollection',
      rawTag,
    });
  }
  return {
    kind: 'collection',
    name: parseCollectionTag(tag.value, rawTag),
    fields: collectCollectionFields(tag.subparsed ?? []),
  };
}

function collectCollectionFields(tags: readonly StructuredTag[]): readonly ScalarFieldDefinition[] {
  const fields: ScalarFieldDefinition[] = [];
  const fieldsByName = new Map<string, ScalarFieldDefinition>();
  for (const tag of tags) {
    const rawTag = tag.raw ?? tag.value;
    if (tag.module === 'loop') {
      throw new TemplateTagFailure({
        code: 'UnsupportedTemplateTag',
        reason: 'NestedCollection',
        rawTag,
      });
    }
    if (tag.module !== undefined) unsupportedModule(rawTag, tag.module);
    const field = parseFieldTag(tag.value);
    const existing = fieldsByName.get(field.name);
    if (existing === undefined) {
      fieldsByName.set(field.name, field);
      fields.push(field);
    } else {
      assertCompatibleScalarFields(existing, field, rawTag);
    }
  }
  return fields;
}

function mergeDefinitions(
  existing: FieldDefinition,
  next: FieldDefinition,
  rawTag: string,
): FieldDefinition {
  if (existing.kind !== next.kind) conflicting(next.name, rawTag);
  if (existing.kind === 'scalar' && next.kind === 'scalar') {
    assertCompatibleScalarFields(existing, next, rawTag);
    return existing;
  }
  if (existing.kind === 'collection' && next.kind === 'collection') {
    const fields = [...existing.fields];
    const fieldsByName = new Map(fields.map((field) => [field.name, field]));
    for (const field of next.fields) {
      const prior = fieldsByName.get(field.name);
      if (prior === undefined) {
        fieldsByName.set(field.name, field);
        fields.push(field);
      } else {
        assertCompatibleScalarFields(prior, field, rawTag);
      }
    }
    return { ...existing, fields };
  }
  return conflicting(next.name, rawTag);
}

function assertCompatibleScalarFields(
  existing: ScalarFieldDefinition,
  next: ScalarFieldDefinition,
  rawTag: string,
): void {
  if (!areHintsEqual(existing.hint, next.hint)) conflicting(next.name, rawTag);
}

function areHintsEqual(left: FieldHint, right: FieldHint): boolean {
  if (left.type !== right.type) return false;
  if (left.type !== 'option' || right.type !== 'option') return true;
  return (
    left.values.length === right.values.length &&
    left.values.every((value, index) => value === right.values[index])
  );
}

function conflicting(fieldName: string, rawTag: string): never {
  throw new TemplateTagFailure({
    code: 'ConflictingFieldDefinition',
    fieldName,
    rawTag,
  });
}

function unsupportedModule(rawTag: string, module: string): never {
  throw new TemplateTagFailure({
    code: 'UnsupportedTemplateTag',
    reason: 'UnsupportedModule',
    rawTag,
    module,
  });
}
