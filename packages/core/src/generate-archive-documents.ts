import PizZip from 'pizzip';

import {
  ArchiveFailedError,
  renderPlannedDocuments,
  validateMultiDocumentPlan,
} from './multi-document-generation.js';
import {
  preflightDocxOutputPlan,
  type ArchiveOutputPlan,
  type DocxOutputPlanItem,
  type OutputPlanDiagnostic,
} from './plan-docx-output.js';
import type { RecordData } from './record-data.js';
import type { RenderOptions } from './render-options.js';
import { writeOutputFile } from './write-single-document.js';

export interface ExecuteArchiveDocumentGenerationInput {
  readonly template: Buffer;
  readonly records: readonly RecordData[];
  readonly sourceTemplatePath: string;
  readonly plan: ArchiveOutputPlan;
  readonly renderOptions?: RenderOptions;
}

export interface ArchiveDocumentEntryResult {
  readonly item: DocxOutputPlanItem;
  readonly entryPath: string;
  readonly documentBytes: number;
}

export interface ArchiveDocumentGenerationSuccess {
  readonly ok: true;
  readonly plan: ArchiveOutputPlan;
  readonly path: string;
  readonly bytesWritten: number;
  readonly entryCount: number;
  readonly entries: readonly ArchiveDocumentEntryResult[];
}

export interface ArchiveDocumentGenerationRejected {
  readonly ok: false;
  readonly plan: ArchiveOutputPlan;
  readonly diagnostics: readonly OutputPlanDiagnostic[];
}

export type ExecuteArchiveDocumentGenerationResult =
  | ArchiveDocumentGenerationSuccess
  | ArchiveDocumentGenerationRejected;

/** Builds the complete archive in memory before publishing the final ZIP file. */
export async function executeArchiveDocumentGeneration(
  input: ExecuteArchiveDocumentGenerationInput,
): Promise<ExecuteArchiveDocumentGenerationResult> {
  const planDiagnostics = validateMultiDocumentPlan(input.plan, 'archive', input.records.length);
  if (planDiagnostics.length > 0) {
    return { ok: false, plan: input.plan, diagnostics: planDiagnostics };
  }

  const preflight = await preflightDocxOutputPlan(input.plan, {
    sourceTemplatePath: input.sourceTemplatePath,
  });
  if (!preflight.ok) {
    return { ok: false, plan: input.plan, diagnostics: preflight.diagnostics };
  }

  const renderedDocuments = renderPlannedDocuments(
    input.template,
    input.records,
    input.plan.items,
    input.renderOptions,
  );
  const archive = new PizZip();
  const entries: ArchiveDocumentEntryResult[] = [];

  for (const rendered of renderedDocuments) {
    try {
      archive.file(rendered.item.relativePath, rendered.buffer);
      entries.push({
        item: rendered.item,
        entryPath: rendered.item.relativePath,
        documentBytes: rendered.buffer.byteLength,
      });
    } catch (cause) {
      throw new ArchiveFailedError(cause, rendered.item);
    }
  }

  let archiveBuffer: Buffer;
  try {
    // PizZip's default STORE method avoids recompressing already-compressed DOCX packages.
    archiveBuffer = archive.generate({ type: 'nodebuffer' });
  } catch (cause) {
    throw new ArchiveFailedError(cause);
  }

  const output = await writeOutputFile(
    archiveBuffer,
    {
      rootDirectory: input.plan.rootDirectory,
      fileName: input.plan.archiveFileName,
    },
    {
      sourceTemplatePath: input.sourceTemplatePath,
      conflictPolicy: input.plan.conflictPolicy,
    },
    '.zip',
  );

  return {
    ok: true,
    plan: input.plan,
    ...output,
    entryCount: entries.length,
    entries,
  };
}
