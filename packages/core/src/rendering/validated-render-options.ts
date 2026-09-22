import type { FieldPath, RenderLocale } from './render-options.js';

export type ValidatedFieldFormat =
  | {
      readonly type: 'date';
      readonly pattern: string;
      readonly locale: RenderLocale;
    }
  | {
      readonly type: 'datetime';
      readonly pattern: string;
      readonly locale: RenderLocale;
      readonly timeZone: string;
    }
  | {
      readonly type: 'number';
      readonly locale: RenderLocale;
      readonly options: Readonly<Intl.NumberFormatOptions>;
    }
  | {
      readonly type: 'boolean';
      readonly trueText: string;
      readonly falseText: string;
    };

export interface ValidatedFieldFormatRule {
  readonly path: FieldPath;
  readonly format: ValidatedFieldFormat;
}

export interface ValidatedRenderOptions {
  readonly locale: RenderLocale;
  readonly timeZone: string;
  readonly formats: readonly ValidatedFieldFormatRule[];
}
