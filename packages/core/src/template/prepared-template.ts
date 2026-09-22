import type { TemplateDefinition } from './template-definition.js';

declare const preparedTemplateBrand: unique symbol;

export interface PreparedTemplate {
  readonly kind: 'prepared-docx-template';
  readonly definition: TemplateDefinition;
  readonly [preparedTemplateBrand]: true;
}

const sources = new WeakMap<PreparedTemplate, Uint8Array>();

export function createPreparedTemplate(
  source: Uint8Array,
  definition: TemplateDefinition,
): PreparedTemplate {
  const prepared = Object.freeze({
    kind: 'prepared-docx-template' as const,
    definition,
  }) as PreparedTemplate;
  sources.set(prepared, source.slice());
  return prepared;
}

/** Internal rendering boundary. Returns a defensive copy for a fresh mutable DOCX package. */
export function copyPreparedTemplateSource(template: PreparedTemplate): Uint8Array {
  const source = sources.get(template);
  if (source === undefined) {
    throw new TypeError('The prepared template was not created by this core instance.');
  }
  return source.slice();
}
