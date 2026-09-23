import type { RecordData } from './record-data';
import type { RecordOrigin } from './record-origin';

export interface NormalizedRecordBatch {
  readonly records: readonly RecordData[];
  readonly origins: readonly RecordOrigin[];
}
