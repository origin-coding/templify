import type { TemplateDefinition } from '@templify/core';

export interface DesktopIssue {
  readonly stage: string;
  readonly code: string;
  readonly details: string;
}

export type DesktopResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly issue: DesktopIssue };

export interface InspectedTemplate {
  readonly path: string;
  readonly definition: TemplateDefinition;
}

export interface GeneratedDocument {
  readonly path: string;
  readonly replacedExisting: boolean;
}

export interface DesktopApi {
  selectTemplate(): Promise<DesktopResult<InspectedTemplate>>;
  generateDocument(
    record: Readonly<Record<string, unknown>>,
    overwrite: boolean,
  ): Promise<DesktopResult<GeneratedDocument>>;
}
