export type FieldHint =
  | { readonly type: 'string' }
  | { readonly type: 'number' }
  | { readonly type: 'boolean' }
  | { readonly type: 'date' }
  | { readonly type: 'option'; readonly values: readonly string[] };

export interface FieldDefinition {
  readonly name: string;
  readonly hint: FieldHint;
}
