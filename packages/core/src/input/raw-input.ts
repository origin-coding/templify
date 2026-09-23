import type { InputRowOrigin } from './record-origin';

export interface ObjectRowsInput {
  readonly kind: 'object-rows';
  readonly rows: unknown;
}

export interface TabularInput {
  readonly kind: 'tabular';
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
  readonly origins?: readonly InputRowOrigin[];
}

export type RawInputBatch = ObjectRowsInput | TabularInput;
