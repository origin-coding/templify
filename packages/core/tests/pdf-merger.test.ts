import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { cantooPdfMerger } from '@/index.js';

describe('cantooPdfMerger', () => {
  it('copies every page in document order', async () => {
    const first = await createPdf(1);
    const second = await createPdf(2);

    const mergedBytes = await cantooPdfMerger.merge([first, second]);
    const merged = await PDFDocument.load(mergedBytes, { updateMetadata: false });

    expect(merged.getPageCount()).toBe(3);
  });

  it('rejects an empty aggregate', async () => {
    await expect(cantooPdfMerger.merge([])).rejects.toThrow(
      'At least one PDF document is required.',
    );
  });
});

async function createPdf(pageCount: number): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  for (let index = 0; index < pageCount; index += 1) document.addPage([100, 100]);
  return document.save();
}
