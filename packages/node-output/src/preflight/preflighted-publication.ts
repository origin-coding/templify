import type { PublicationPlan } from '@/plan/publication-plan';
import type { TargetSnapshot } from './target-snapshot';

declare const preflightedPublicationBrand: unique symbol;

export interface PreflightedPublicationItem {
  readonly artifactId: string;
  readonly destinationPath: string;
  readonly action: 'create' | 'replace';
}

export interface PreflightedPublication {
  readonly plan: PublicationPlan;
  readonly items: readonly PreflightedPublicationItem[];
  readonly [preflightedPublicationBrand]: true;
}

const snapshots = new WeakMap<PreflightedPublication, ReadonlyMap<string, TargetSnapshot>>();

export function createPreflightedPublication(
  plan: PublicationPlan,
  items: readonly PreflightedPublicationItem[],
  targetSnapshots: ReadonlyMap<string, TargetSnapshot>,
): PreflightedPublication {
  const result = Object.freeze({
    plan,
    items: Object.freeze([...items]),
  }) as PreflightedPublication;
  snapshots.set(result, targetSnapshots);
  return result;
}

export function getPreflightSnapshots(
  value: PreflightedPublication,
): ReadonlyMap<string, TargetSnapshot> {
  const valueSnapshots = snapshots.get(value);
  if (valueSnapshots === undefined) throw new TypeError('Unknown preflighted publication.');
  return valueSnapshots;
}
