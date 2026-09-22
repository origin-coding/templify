export { createGenerationPlan } from './create-generation-plan.js';
export type {
  CreateGenerationPlanInput,
  CreateGenerationPlanResult,
} from './create-generation-plan.js';
export type {
  ArtifactPathErrorReason,
  GenerationError,
  GenerationPlanError,
  GenerationPlanWarning,
  GenerationWarning,
  InvalidGenerationError,
  NamingValueSanitizedWarning,
  PdfConversionLossWarning,
} from './generation-diagnostics.js';
export type {
  AggregatePlanItem,
  DocumentPlanItem,
  GenerationPlan,
  MergedPdfPlanItem,
} from './generation-plan.js';
export type {
  AggregateRequest,
  BundleStrategy,
  DocumentOutputSelection,
  GenerationNaming,
  GenerationRequest,
  MergedPdfRequest,
} from './generation-request.js';
export { generateArtifacts, type GenerationDependencies } from './generate-artifacts.js';
export { createGeneration, type Generation } from './generation.js';
