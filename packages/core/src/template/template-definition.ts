import type { FieldDefinition } from './field-definition.js';

export interface TemplateDefinition {
  readonly version: 1;
  readonly kind: 'docx';
  readonly fields: readonly FieldDefinition[];
}
