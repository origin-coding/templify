import type { FieldDefinition } from './field-definition';

export interface TemplateDefinition {
  readonly version: 1;
  readonly kind: 'docx';
  readonly fields: readonly FieldDefinition[];
}
