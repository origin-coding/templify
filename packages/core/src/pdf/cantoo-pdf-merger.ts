/* eslint-disable no-await-in-loop -- Page copying mutates one destination and must preserve document order. */
import { PDFDocument } from '@cantoo/pdf-lib';

import type { PdfMerger } from '@/pdf/pdf-merger';

export const cantooPdfMerger: PdfMerger = {
  async merge(documents) {
    if (documents.length === 0) {
      throw new TypeError('At least one PDF document is required.');
    }
    const merged = await PDFDocument.create({ updateMetadata: false });
    for (const bytes of documents) {
      const source = await PDFDocument.load(bytes, { updateMetadata: false });
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    return merged.save();
  },
};
