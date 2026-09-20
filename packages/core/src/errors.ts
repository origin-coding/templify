export type TemplateInspectionErrorCode =
  | 'InvalidTemplate'
  | 'InvalidTemplateTag'
  | 'ConflictingFieldDefinition'
  | 'UnsupportedTemplateTag';

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
