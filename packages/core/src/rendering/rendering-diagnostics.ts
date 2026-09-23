import type { InputDataPath } from '@/input/input-diagnostics';

export type RenderOptionsError = {
  readonly code: 'InvalidRenderOptions';
  readonly reason:
    | 'InvalidLocale'
    | 'InvalidTimeZone'
    | 'InvalidFormatRule'
    | 'InvalidFieldPath'
    | 'UnknownFieldPath'
    | 'DuplicateFieldPath'
    | 'IncompatibleFormatType'
    | 'InvalidDatePattern'
    | 'InvalidNumberFormat'
    | 'InvalidBooleanFormat';
  readonly fieldPath?: readonly string[];
};

export type DocumentRenderError =
  | {
      readonly code: 'MissingInputField';
      readonly dataPath: InputDataPath;
    }
  | {
      readonly code: 'InvalidInputValue';
      readonly dataPath: InputDataPath;
      readonly reason: 'InvalidScalarValue' | 'InvalidCollectionValue' | 'InvalidCollectionItem';
    }
  | { readonly code: 'RenderFailed' };
