export {
  ConflictingFieldDefinitionError,
  DocumentOutputError,
  DocumentRenderError,
  InvalidOutputFilenameError,
  InvalidOutputPathError,
  InvalidInputValueError,
  InvalidTemplateError,
  InvalidTemplateTagError,
  MissingInputFieldError,
  OutputConflictError,
  OutputDirectoryNotFoundError,
  OutputPermissionDeniedError,
  OutputSameAsTemplateError,
  OutputTargetIsDirectoryError,
  OutputWriteFailedError,
  RenderFailedError,
  TemplateInspectionError,
  UnsafeOutputPathError,
  UnsupportedTemplateTagError,
} from './errors.js';
export type {
  DocumentOutputErrorCode,
  DocumentOutputErrorOptions,
  DocumentOutputErrorReason,
  DocumentOutputPhase,
  DocumentRenderErrorCode,
  DocumentRenderErrorReason,
  TemplateInspectionErrorCode,
} from './errors.js';
export type {
  CollectionFieldDefinition,
  FieldDefinition,
  FieldHint,
  ScalarFieldDefinition,
} from './field-definition.js';
export { inspectTemplate } from './inspect-template.js';
export { parseFieldTag } from './parse-field-tag.js';
export { createDocxOutputPlan, preflightDocxOutputPlan } from './plan-docx-output.js';
export type {
  ArchiveOutputPlan,
  ArchivePlanTarget,
  CreateDocxOutputPlanInput,
  CreateDocxOutputPlanResult,
  DirectoryOutputPlan,
  DirectoryPlanTarget,
  DocxOutputMode,
  DocxOutputPlan,
  DocxOutputPlanItem,
  DocxOutputPlanTarget,
  DraftDocxOutputPlan,
  OutputPlanDiagnostic,
  OutputPlanDiagnosticCode,
  OutputPlanPreflightOptions,
  OutputPlanPreflightResult,
  SingleDocumentOutputPlan,
  SingleDocumentPlanTarget,
} from './plan-docx-output.js';
export type {
  CollectionData,
  FlatRecord,
  PrimitiveValue,
  RecordData,
  RecordValue,
} from './record-data.js';
export { renderTemplate } from './render-template.js';
export { writeSingleDocument } from './write-single-document.js';
export type {
  ConflictPolicy,
  SingleDocumentOutputOptions,
  SingleDocumentOutputResult,
  SingleDocumentTarget,
} from './write-single-document.js';
