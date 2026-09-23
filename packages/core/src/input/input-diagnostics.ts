export type InputDataPath =
  | readonly [fieldName: string]
  | readonly [collectionName: string, itemIndex: number]
  | readonly [collectionName: string, itemIndex: number, fieldName: string];

export interface InputDiagnosticLocation {
  readonly inputRowIndex?: number;
  readonly sourceRowNumber?: number;
  readonly sourceColumnNumber?: number;
  readonly sheetName?: string;
  readonly path?: InputDataPath;
}

export type InputValueType =
  | 'undefined'
  | 'null'
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'function'
  | 'symbol'
  | 'bigint';

export type InputNormalizationError =
  | {
      readonly code: 'InvalidInputShape';
      readonly reason: 'ExpectedRowsArray' | 'ExpectedRowObject' | 'InvalidOriginCount';
      readonly location?: InputDiagnosticLocation;
    }
  | {
      readonly code: 'DuplicateInputField';
      readonly fieldName: string;
      readonly columnNumbers: readonly [number, number, ...number[]];
    }
  | {
      readonly code: 'MissingInputField';
      readonly fieldName: string;
      readonly location?: InputDiagnosticLocation;
    }
  | {
      readonly code: 'InvalidInputValue';
      readonly expected: 'string' | 'number' | 'boolean' | 'date' | 'datetime';
      readonly receivedType: InputValueType;
      readonly reason:
        | 'TypeMismatch'
        | 'InvalidNumber'
        | 'NonFiniteNumber'
        | 'InvalidDate'
        | 'InvalidDateTime'
        | 'UndefinedValue';
      readonly location: InputDiagnosticLocation;
    }
  | {
      readonly code: 'InvalidCollectionValue';
      readonly reason: 'ExpectedArray';
      readonly receivedType: InputValueType;
      readonly location: InputDiagnosticLocation;
    }
  | {
      readonly code: 'InvalidCollectionItem';
      readonly reason: 'ExpectedObject' | 'NestedCollection';
      readonly receivedType: InputValueType;
      readonly location: InputDiagnosticLocation;
    }
  | { readonly code: 'NoInputRecords' };

export type InputNormalizationWarning =
  | {
      readonly code: 'ExtraInputFieldsIgnored';
      readonly fieldNames: readonly string[];
      readonly location?: InputDiagnosticLocation;
    }
  | {
      readonly code: 'EmptyInputRowsIgnored';
      readonly rowCount: number;
      readonly sourceRowNumbers?: readonly number[];
      readonly sheetName?: string;
    };
