export type TemplateInspectionErrorCode =
  | 'InvalidTemplate'
  | 'InvalidTemplateTag'
  | 'ConflictingFieldDefinition'
  | 'UnsupportedTemplateTag';

export type DocumentRenderErrorCode = 'MissingInputField' | 'InvalidInputValue' | 'RenderFailed';

export type DocumentRenderErrorReason =
  | 'MissingScalarField'
  | 'MissingCollection'
  | 'MissingCollectionItemField'
  | 'InvalidScalarValue'
  | 'InvalidCollectionValue'
  | 'InvalidCollectionItem'
  | 'InvalidCollectionItemValue';

export type DocumentOutputErrorCode =
  | 'InvalidOutputPath'
  | 'InvalidOutputFilename'
  | 'UnsafeOutputPath'
  | 'OutputSameAsTemplate'
  | 'OutputDirectoryNotFound'
  | 'OutputTargetIsDirectory'
  | 'OutputConflict'
  | 'OutputPermissionDenied'
  | 'OutputWriteFailed';

export type DocumentOutputErrorReason =
  | 'RootNotAbsolute'
  | 'RootNotDirectory'
  | 'DirectoryNotFound'
  | 'PathTooLong'
  | 'EmptyFilename'
  | 'AbsoluteFilename'
  | 'NestedFilename'
  | 'DotFilename'
  | 'InvalidCharacter'
  | 'TrailingDotOrSpace'
  | 'ReservedDeviceName'
  | 'UnsupportedExtension'
  | 'FilenameTooLong'
  | 'OutsideOutputRoot'
  | 'SameFile'
  | 'TargetExists'
  | 'TargetIsDirectory'
  | 'PermissionDenied'
  | 'AccessDeniedOrFileInUse'
  | 'DiskFull'
  | 'IoFailure';

export type DocumentOutputPhase =
  | 'validation'
  | 'target-creation'
  | 'temporary-file-creation'
  | 'write'
  | 'flush'
  | 'close'
  | 'replacement'
  | 'cleanup';

export interface DocumentOutputErrorOptions extends ErrorOptions {
  readonly path?: string | undefined;
  readonly reason?: DocumentOutputErrorReason | undefined;
  readonly phase?: DocumentOutputPhase | undefined;
  readonly systemCode?: string | undefined;
}

export abstract class DocumentOutputError extends Error {
  abstract readonly code: DocumentOutputErrorCode;
  readonly path: string | undefined;
  readonly reason: DocumentOutputErrorReason | undefined;
  readonly phase: DocumentOutputPhase | undefined;
  readonly systemCode: string | undefined;

  constructor(message: string, options: DocumentOutputErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.path = options.path;
    this.reason = options.reason;
    this.phase = options.phase;
    this.systemCode = options.systemCode;
  }
}

export class InvalidOutputPathError extends DocumentOutputError {
  readonly code = 'InvalidOutputPath' as const;
}

export class InvalidOutputFilenameError extends DocumentOutputError {
  readonly code = 'InvalidOutputFilename' as const;
}

export class UnsafeOutputPathError extends DocumentOutputError {
  readonly code = 'UnsafeOutputPath' as const;
}

export class OutputSameAsTemplateError extends DocumentOutputError {
  readonly code = 'OutputSameAsTemplate' as const;
}

export class OutputDirectoryNotFoundError extends DocumentOutputError {
  readonly code = 'OutputDirectoryNotFound' as const;
}

export class OutputTargetIsDirectoryError extends DocumentOutputError {
  readonly code = 'OutputTargetIsDirectory' as const;
}

export class OutputConflictError extends DocumentOutputError {
  readonly code = 'OutputConflict' as const;
}

export class OutputPermissionDeniedError extends DocumentOutputError {
  readonly code = 'OutputPermissionDenied' as const;
}

export class OutputWriteFailedError extends DocumentOutputError {
  readonly code = 'OutputWriteFailed' as const;
}

interface TemplateInspectionErrorOptions extends ErrorOptions {
  readonly rawTag?: string;
}

export abstract class TemplateInspectionError extends Error {
  abstract readonly code: TemplateInspectionErrorCode;
  readonly rawTag: string | undefined;

  protected constructor(message: string, options: TemplateInspectionErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.rawTag = options.rawTag;
  }
}

export class InvalidTemplateError extends TemplateInspectionError {
  readonly code = 'InvalidTemplate' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }
}

export class InvalidTemplateTagError extends TemplateInspectionError {
  readonly code = 'InvalidTemplateTag' as const;

  constructor(rawTag: string, message: string, options: ErrorOptions = {}) {
    super(message, { ...options, rawTag });
  }
}

export class ConflictingFieldDefinitionError extends TemplateInspectionError {
  readonly code = 'ConflictingFieldDefinition' as const;

  constructor(fieldName: string, rawTag: string) {
    super(`Field "${fieldName}" has conflicting definitions in the same scope.`, { rawTag });
  }
}

export class UnsupportedTemplateTagError extends TemplateInspectionError {
  readonly code = 'UnsupportedTemplateTag' as const;

  constructor(rawTag: string, message = `Unsupported template tag: ${rawTag}`) {
    super(message, { rawTag });
  }
}

interface DocumentRenderErrorOptions extends ErrorOptions {
  readonly fieldName?: string | undefined;
  readonly dataPath?: readonly (string | number)[] | undefined;
  readonly reason?: DocumentRenderErrorReason | undefined;
}

export abstract class DocumentRenderError extends Error {
  abstract readonly code: DocumentRenderErrorCode;
  readonly fieldName: string | undefined;
  readonly dataPath: readonly (string | number)[] | undefined;
  readonly reason: DocumentRenderErrorReason | undefined;

  protected constructor(message: string, options: DocumentRenderErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.fieldName = options.fieldName;
    this.dataPath = options.dataPath;
    this.reason = options.reason;
  }
}

export class MissingInputFieldError extends DocumentRenderError {
  readonly code = 'MissingInputField' as const;

  constructor(
    fieldName: string,
    options: {
      readonly dataPath?: readonly (string | number)[] | undefined;
      readonly reason?:
        | 'MissingScalarField'
        | 'MissingCollection'
        | 'MissingCollectionItemField'
        | undefined;
    } = {},
  ) {
    const dataPath = options.dataPath ?? [fieldName];
    super(`The input data is missing the template field "${formatDataPath(dataPath)}".`, {
      fieldName,
      dataPath,
      reason: options.reason ?? 'MissingScalarField',
    });
  }
}

export class InvalidInputValueError extends DocumentRenderError {
  readonly code = 'InvalidInputValue' as const;

  constructor(
    fieldName: string,
    message: string,
    options: ErrorOptions & {
      readonly dataPath?: readonly (string | number)[] | undefined;
      readonly reason?: DocumentRenderErrorReason | undefined;
    } = {},
  ) {
    super(message, { ...options, fieldName });
  }
}

export class RenderFailedError extends DocumentRenderError {
  readonly code = 'RenderFailed' as const;

  constructor(message = 'The DOCX template could not be rendered.', options: ErrorOptions = {}) {
    super(message, options);
  }
}

function formatDataPath(dataPath: readonly (string | number)[]): string {
  return dataPath
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${part}`,
    )
    .join('');
}
