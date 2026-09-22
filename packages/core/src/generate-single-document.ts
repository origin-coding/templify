import path from 'node:path';

import {
  createDocxOutputPlan,
  preflightDocxOutputPlan,
  type DraftDocxOutputPlan,
  type DocxOutputPlanItem,
  type OutputPlanDiagnostic,
  type SingleDocumentOutputPlan,
} from './plan-docx-output.js';
import type { RecordData } from './record-data.js';
import type { RenderOptions } from './render-options.js';
import { renderTemplate } from './render-template.js';
import {
  writeSingleDocument,
  type ConflictPolicy,
  type SingleDocumentOutputResult,
} from './write-single-document.js';

export interface PlanSingleDocumentGenerationInput {
  readonly records: readonly RecordData[];
  readonly target: {
    readonly rootDirectory: string;
    readonly fileName: string;
  };
  readonly conflictPolicy?: ConflictPolicy;
}

export type PlanSingleDocumentGenerationResult =
  | { readonly ok: true; readonly plan: SingleDocumentOutputPlan }
  | {
      readonly ok: false;
      readonly draft: DraftDocxOutputPlan;
      readonly errors: readonly OutputPlanDiagnostic[];
    };

export interface ExecuteSingleDocumentGenerationInput {
  readonly template: Buffer;
  readonly record: RecordData;
  readonly sourceTemplatePath: string;
  readonly plan: SingleDocumentOutputPlan;
  readonly renderOptions?: RenderOptions;
}

export interface SingleDocumentGenerationSuccess extends SingleDocumentOutputResult {
  readonly ok: true;
  readonly plan: SingleDocumentOutputPlan;
  readonly item: DocxOutputPlanItem;
}

export interface SingleDocumentGenerationRejected {
  readonly ok: false;
  readonly plan: SingleDocumentOutputPlan;
  readonly diagnostics: readonly OutputPlanDiagnostic[];
}

export type ExecuteSingleDocumentGenerationResult =
  | SingleDocumentGenerationSuccess
  | SingleDocumentGenerationRejected;

/** Creates a side-effect-free single-document plan for caller review and confirmation. */
export function planSingleDocumentGeneration(
  input: PlanSingleDocumentGenerationInput,
): PlanSingleDocumentGenerationResult {
  const result = createDocxOutputPlan({
    records: input.records,
    fields: [],
    target: { mode: 'single-document', ...input.target },
    ...(input.conflictPolicy === undefined ? {} : { conflictPolicy: input.conflictPolicy }),
  });

  if (!result.ok) return result;

  // The fixed target above makes other modes unreachable, but retain the guard at the public boundary.
  if (result.plan.mode !== 'single-document') {
    return {
      ok: false,
      draft: { mode: result.plan.mode, items: result.plan.items },
      errors: [invalidPlan('The output planner returned an incompatible output mode.')],
    };
  }

  return { ok: true, plan: result.plan };
}

/** Executes an accepted plan after rechecking its structure and current filesystem state. */
export async function executeSingleDocumentGeneration(
  input: ExecuteSingleDocumentGenerationInput,
): Promise<ExecuteSingleDocumentGenerationResult> {
  const planDiagnostics = validateAcceptedPlan(input.plan);
  if (planDiagnostics.length > 0) {
    return { ok: false, plan: input.plan, diagnostics: planDiagnostics };
  }

  const preflight = await preflightDocxOutputPlan(input.plan, {
    sourceTemplatePath: input.sourceTemplatePath,
  });
  if (!preflight.ok) {
    return { ok: false, plan: input.plan, diagnostics: preflight.diagnostics };
  }

  const item = input.plan.items[0]!;
  const document = renderTemplate(input.template, input.record, input.renderOptions);
  const output = await writeSingleDocument(
    document,
    {
      rootDirectory: input.plan.rootDirectory,
      fileName: item.relativePath,
    },
    {
      sourceTemplatePath: input.sourceTemplatePath,
      conflictPolicy: input.plan.conflictPolicy,
    },
  );

  return { ok: true, plan: input.plan, item, ...output };
}

function validateAcceptedPlan(plan: SingleDocumentOutputPlan): readonly OutputPlanDiagnostic[] {
  if (plan.mode !== 'single-document') {
    return [invalidPlan('Single-document generation requires a single-document output plan.')];
  }

  if (plan.items.length !== 1) {
    return [invalidPlan('A single-document output plan must contain exactly one item.')];
  }

  const item = plan.items[0]!;
  if (item.recordIndex !== 0) {
    return [invalidPlan('A single-document output plan item must reference record index 0.')];
  }

  if (item.destinationPath === undefined) {
    return [invalidPlan('A single-document output plan item must contain a destination path.')];
  }

  const expectedDestination = path.resolve(plan.rootDirectory, item.relativePath);
  if (!pathsEqual(expectedDestination, path.resolve(item.destinationPath))) {
    return [
      invalidPlan('The single-document plan destination does not match its accepted output path.'),
    ];
  }

  return [];
}

function invalidPlan(message: string): OutputPlanDiagnostic {
  return { code: 'InvalidOutputPlan', message, severity: 'error' };
}

function pathsEqual(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
}
