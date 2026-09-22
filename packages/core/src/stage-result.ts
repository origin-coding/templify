export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type StageResult<T, E, W = never> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly warnings: readonly W[];
    }
  | {
      readonly ok: false;
      readonly errors: NonEmptyReadonlyArray<E>;
      readonly warnings: readonly W[];
    };
