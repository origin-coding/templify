export type TemplateInspectionErrorCode =
  | 'InvalidTemplate'
  | 'InvalidTemplateTag'
  | 'ConflictingFieldDefinition'
  | 'UnsupportedTemplateTag';

export type DocumentRenderErrorCode = 'MissingInputField' | 'InvalidInputValue' | 'RenderFailed';

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
    super(`Field "${fieldName}" has conflicting type definitions.`, { rawTag });
  }
}

export class UnsupportedTemplateTagError extends TemplateInspectionError {
  readonly code = 'UnsupportedTemplateTag' as const;

  constructor(rawTag: string, message = `Unsupported template tag: ${rawTag}`) {
    super(message, { rawTag });
  }
}

interface DocumentRenderErrorOptions extends ErrorOptions {
  readonly fieldName?: string;
}

export abstract class DocumentRenderError extends Error {
  abstract readonly code: DocumentRenderErrorCode;
  readonly fieldName: string | undefined;

  protected constructor(message: string, options: DocumentRenderErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.fieldName = options.fieldName;
  }
}

export class MissingInputFieldError extends DocumentRenderError {
  readonly code = 'MissingInputField' as const;

  constructor(fieldName: string) {
    super(`The input record is missing the template field "${fieldName}".`, { fieldName });
  }
}

export class InvalidInputValueError extends DocumentRenderError {
  readonly code = 'InvalidInputValue' as const;

  constructor(fieldName: string, message: string, options: ErrorOptions = {}) {
    super(message, { ...options, fieldName });
  }
}

export class RenderFailedError extends DocumentRenderError {
  readonly code = 'RenderFailed' as const;

  constructor(message = 'The DOCX template could not be rendered.', options: ErrorOptions = {}) {
    super(message, options);
  }
}
