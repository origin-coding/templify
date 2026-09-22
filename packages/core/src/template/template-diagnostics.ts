export type TemplatePreparationError =
  | {
      readonly code: 'InvalidTemplate';
      readonly reason: 'InvalidDocx' | 'CompileFailed';
    }
  | {
      readonly code: 'InvalidTemplateTag';
      readonly reason:
        | 'EmptyFieldName'
        | 'InvalidFieldName'
        | 'InvalidCollectionHint'
        | 'UnknownFieldHint'
        | 'InvalidOptionHint';
      readonly rawTag: string;
    }
  | {
      readonly code: 'ConflictingFieldDefinition';
      readonly fieldName: string;
      readonly rawTag: string;
    }
  | {
      readonly code: 'UnsupportedTemplateTag';
      readonly reason: 'UnsupportedModule' | 'InvertedCollection' | 'NestedCollection';
      readonly rawTag: string;
      readonly module?: string;
    };
