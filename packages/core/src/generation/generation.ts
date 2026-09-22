import type { NormalizedRecordBatch } from '@/input/normalized-record-batch.js';
import {
  createFieldValueFormatter,
  type FieldValueFormatter,
} from '@/rendering/field-value-formatter.js';
import type { ValidatedRenderOptions } from '@/rendering/validated-render-options.js';
import type { StageResult } from '@/stage-result.js';
import { copyPreparedTemplateSource, type PreparedTemplate } from '@/template/prepared-template.js';
import type { InvalidGenerationError } from './generation-diagnostics.js';
import type { GenerationPlan } from './generation-plan.js';

declare const generationBrand: unique symbol;

export interface Generation {
  readonly template: PreparedTemplate;
  readonly batch: NormalizedRecordBatch;
  readonly renderOptions: ValidatedRenderOptions;
  readonly plan: GenerationPlan;
  readonly [generationBrand]: true;
}

const formatters = new WeakMap<Generation, FieldValueFormatter>();

export function createGeneration(input: {
  readonly template: PreparedTemplate;
  readonly batch: NormalizedRecordBatch;
  readonly renderOptions: ValidatedRenderOptions;
  readonly plan: GenerationPlan;
}): StageResult<Generation, InvalidGenerationError> {
  const errors: InvalidGenerationError[] = [];
  try {
    copyPreparedTemplateSource(input.template);
  } catch {
    errors.push({ code: 'InvalidGeneration', reason: 'InvalidPreparedTemplate' });
  }
  if (
    input.batch.records.length !== input.batch.origins.length ||
    input.plan.documents.length !== input.batch.records.length
  ) {
    errors.push({ code: 'InvalidGeneration', reason: 'RecordCountMismatch' });
  }
  const ids = new Set<string>();
  for (const document of input.plan.documents) {
    if (ids.has(document.documentId))
      errors.push({ code: 'InvalidGeneration', reason: 'DuplicateDocumentId' });
    ids.add(document.documentId);
    if (
      !Number.isInteger(document.recordIndex) ||
      document.recordIndex < 0 ||
      document.recordIndex >= input.batch.records.length
    ) {
      errors.push({ code: 'InvalidGeneration', reason: 'InvalidDocumentReference' });
    }
  }
  for (const aggregate of input.plan.aggregates) {
    if (aggregate.sourceDocumentIds.some((id) => !ids.has(id))) {
      errors.push({ code: 'InvalidGeneration', reason: 'InvalidAggregateReference' });
    }
  }
  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors as [InvalidGenerationError, ...InvalidGenerationError[]],
      warnings: [],
    };
  }
  const generation = Object.freeze({ ...input }) as Generation;
  formatters.set(generation, createFieldValueFormatter(input.renderOptions));
  return { ok: true, value: generation, warnings: [] };
}

export function getGenerationFormatter(generation: Generation): FieldValueFormatter {
  const formatter = formatters.get(generation);
  if (formatter === undefined)
    throw new TypeError('The generation was not created by this core instance.');
  return formatter;
}
