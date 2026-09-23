import type { InputNormalizationError, InputNormalizationWarning } from '@/input/input-diagnostics';
import { normalizeRecords } from '@/input/normalize-records';
import type { RawInputBatch } from '@/input/raw-input';
import { createGenerationPlan } from '@/generation/create-generation-plan';
import type {
  GenerationPlanError,
  GenerationPlanWarning,
  InvalidGenerationError,
} from '@/generation/generation-diagnostics';
import type { GenerationRequest } from '@/generation/generation-request';
import { createGeneration, type Generation } from '@/generation/generation';
import type { RenderOptions } from '@/rendering/render-options';
import type { RenderOptionsError } from '@/rendering/rendering-diagnostics';
import { validateRenderOptions } from '@/rendering/validate-render-options';
import type { StageResult } from '@/stage-result';
import type { PreparedTemplate } from '@/template/prepared-template';

export interface PrepareGenerationInput {
  readonly template: PreparedTemplate;
  readonly input: RawInputBatch;
  readonly renderOptions?: RenderOptions;
  readonly request: GenerationRequest;
}

export type PrepareGenerationError =
  | { readonly stage: 'input'; readonly issue: InputNormalizationError }
  | { readonly stage: 'render-options'; readonly issue: RenderOptionsError }
  | { readonly stage: 'planning'; readonly issue: GenerationPlanError }
  | { readonly stage: 'binding'; readonly issue: InvalidGenerationError };

export type PrepareGenerationWarning =
  | { readonly stage: 'input'; readonly issue: InputNormalizationWarning }
  | { readonly stage: 'planning'; readonly issue: GenerationPlanWarning };

export function prepareGeneration(
  input: PrepareGenerationInput,
): StageResult<Generation, PrepareGenerationError, PrepareGenerationWarning> {
  const normalized = normalizeRecords(input.template.definition, input.input);
  if (!normalized.ok) {
    return {
      ok: false,
      errors: normalized.errors.map((issue) => ({ stage: 'input' as const, issue })) as [
        PrepareGenerationError,
        ...PrepareGenerationError[],
      ],
      warnings: normalized.warnings.map((issue) => ({ stage: 'input' as const, issue })),
    };
  }
  const warnings: PrepareGenerationWarning[] = normalized.warnings.map((issue) => ({
    stage: 'input',
    issue,
  }));
  const options = validateRenderOptions(input.template.definition, input.renderOptions);
  if (!options.ok) {
    return {
      ok: false,
      errors: options.errors.map((issue) => ({ stage: 'render-options' as const, issue })) as [
        PrepareGenerationError,
        ...PrepareGenerationError[],
      ],
      warnings,
    };
  }
  const planned = createGenerationPlan({
    definition: input.template.definition,
    batch: normalized.value,
    renderOptions: options.value,
    request: input.request,
  });
  warnings.push(...planned.warnings.map((issue) => ({ stage: 'planning' as const, issue })));
  if (!planned.ok) {
    return {
      ok: false,
      errors: planned.errors.map((issue) => ({ stage: 'planning' as const, issue })) as [
        PrepareGenerationError,
        ...PrepareGenerationError[],
      ],
      warnings,
    };
  }
  const generation = createGeneration({
    template: input.template,
    batch: normalized.value,
    renderOptions: options.value,
    plan: planned.value,
  });
  if (!generation.ok) {
    return {
      ok: false,
      errors: generation.errors.map((issue) => ({ stage: 'binding' as const, issue })) as [
        PrepareGenerationError,
        ...PrepareGenerationError[],
      ],
      warnings,
    };
  }
  return { ok: true, value: generation.value, warnings };
}
