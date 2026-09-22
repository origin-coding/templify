export type TargetSnapshot =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'file';
      readonly size: number;
      readonly mtimeMs: number;
      readonly device: number;
      readonly inode: number;
    };

export function snapshotsEqual(left: TargetSnapshot, right: TargetSnapshot): boolean {
  return left.kind === 'absent'
    ? right.kind === 'absent'
    : right.kind === 'file' &&
        left.size === right.size &&
        left.mtimeMs === right.mtimeMs &&
        left.device === right.device &&
        left.inode === right.inode;
}
