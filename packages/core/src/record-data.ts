export type PrimitiveValue = string | number | boolean | Date | null;

export type FlatRecord = Readonly<Record<string, PrimitiveValue>>;

export type CollectionData = readonly FlatRecord[];

export type RecordValue = PrimitiveValue | CollectionData;

export type RecordData = Readonly<Record<string, RecordValue>>;
