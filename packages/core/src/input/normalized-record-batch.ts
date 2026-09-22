import type { RecordData } from './record-data.js';
import type { RecordOrigin } from './record-origin.js';

export interface NormalizedRecordBatch {
  readonly records: readonly RecordData[];
  readonly origins: readonly RecordOrigin[];
}
