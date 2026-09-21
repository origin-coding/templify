export type FieldHint =
  | { readonly type: 'string' }
  | { readonly type: 'number' }
  | { readonly type: 'boolean' }
  | { readonly type: 'date' }
  | { readonly type: 'option'; readonly values: readonly string[] };

export interface ScalarFieldDefinition {
  readonly kind: 'scalar';
  readonly name: string;
  readonly hint: FieldHint;
}

export interface CollectionFieldDefinition {
  readonly kind: 'collection';
  readonly name: string;
  readonly fields: readonly ScalarFieldDefinition[];
}

export type FieldDefinition = ScalarFieldDefinition | CollectionFieldDefinition;
