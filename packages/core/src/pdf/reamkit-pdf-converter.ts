import { Ream } from 'reamkit';

import type { PdfConverter } from './pdf-converter.js';

export const reamkitPdfConverter: PdfConverter = {
  id: 'reamkit',
  async getAvailability() {
    return { available: true };
  },
  async convert(docx) {
    const parsed = Ream.parse(docx);
    const result = await parsed.convertWithReport('pdf');
    return {
      bytes: new Uint8Array(result.bytes),
      losses: result.losses.map((loss) =>
        loss.where === undefined
          ? { severity: loss.severity, feature: loss.feature, detail: loss.detail }
          : {
              severity: loss.severity,
              feature: loss.feature,
              detail: loss.detail,
              where: loss.where,
            },
      ),
    };
  },
};
