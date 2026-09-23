export type ScalarValue = string | number | boolean | Date | null;

export type CollectionItemData = Readonly<Record<string, ScalarValue>>;

export type CollectionData = readonly CollectionItemData[];

export type RecordValue = ScalarValue | CollectionData;

export type RecordData = Readonly<Record<string, RecordValue>>;
