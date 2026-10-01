import type { RecordData, RecordOrigin, TemplateDefinition } from '@templify/core';
import type { AppSettings, LanguagePreference } from './settings';

export interface DesktopIssue {
  readonly stage: string;
  readonly code: string;
  readonly details: string;
  readonly data?: Readonly<Record<string, unknown>>;
}
export type DesktopResult<T> =
  | { readonly status: 'ok'; readonly value: T; readonly warnings: readonly DesktopIssue[] }
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'error';
      readonly issue: DesktopIssue;
      readonly issues: readonly DesktopIssue[];
      readonly warnings: readonly DesktopIssue[];
      readonly source?: InputSource;
    };
export interface InspectedTemplate {
  readonly path: string;
  readonly definition: TemplateDefinition;
}
export interface InputSource {
  readonly path: string;
  readonly format: 'csv' | 'xlsx';
  readonly sheets: readonly string[];
  readonly sheet?: string;
  readonly encoding: 'utf8' | 'gbk';
}
export interface ImportedRecords {
  readonly source: InputSource;
  readonly records: readonly RecordData[];
  readonly origins: readonly RecordOrigin[];
}
export interface ImportOptions {
  readonly sheet?: string;
  readonly encoding: 'utf8' | 'gbk';
}
export type OutputMode = 'single' | 'directory' | 'zip';
export interface OutputSettings {
  readonly mode: OutputMode;
  readonly destination: string;
  readonly pathTemplate: string;
}
export interface OutputPreview {
  readonly id: number;
  readonly documentCount: number;
  readonly paths: readonly string[];
  readonly destination: string;
  readonly mode: OutputMode;
}
export interface GeneratedDocuments {
  readonly documentCount: number;
  readonly paths: readonly string[];
  readonly replacedCount: number;
}
export interface DesktopApi {
  getSettings(): Promise<AppSettings>;
  setLanguage(language: LanguagePreference): Promise<DesktopResult<AppSettings>>;
  onPhase(callback: (phase: string) => void): () => void;
  selectTemplate(): Promise<DesktopResult<InspectedTemplate>>;
  importRecords(options: ImportOptions, reuse: boolean): Promise<DesktopResult<ImportedRecords>>;
  exportExcel(): Promise<DesktopResult<string>>;
  openExcelTemplate(): Promise<DesktopResult<boolean>>;
  openDocumentation(): Promise<DesktopResult<boolean>>;
  validateRecords(
    records: readonly Readonly<Record<string, unknown>>[] | null,
  ): Promise<DesktopResult<number>>;
  selectOutput(mode: OutputMode): Promise<DesktopResult<string>>;
  previewOutput(
    records: readonly Readonly<Record<string, unknown>>[] | null,
    settings: OutputSettings,
  ): Promise<DesktopResult<OutputPreview>>;
  generate(previewId: number): Promise<DesktopResult<GeneratedDocuments>>;
  openOutput(): Promise<DesktopResult<boolean>>;
  resetInput(): Promise<DesktopResult<boolean>>;
  invalidateOutput(): Promise<DesktopResult<boolean>>;
  reset(): Promise<DesktopResult<boolean>>;
}
