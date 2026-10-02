import { Ream } from 'reamkit';

export function readPdfText(bytes: Uint8Array): string {
  return JSON.stringify(Ream.parse(bytes).flow.body);
}
