import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalFonts, readLocalFonts } from '../src/renderer/utils/local-fonts';
type Face = { family: string; style: string; postscriptName: string; blob: () => Promise<Blob> };

beforeEach(clearLocalFonts);
afterEach(() => {
  clearLocalFonts();
  vi.unstubAllGlobals();
});
describe('renderer local fonts', () => {
  it('reads only requested family/style bytes and reuses them in memory', async () => {
    const regular = vi.fn<() => Promise<Blob>>(async () => new Blob([new Uint8Array([1, 2, 3])]));
    const bold = vi.fn<() => Promise<Blob>>(async () => new Blob([]));
    const other = vi.fn<() => Promise<Blob>>(async () => new Blob([]));
    const queryLocalFonts = vi.fn<() => Promise<Face[]>>(async () => [
      { family: 'Arial', style: 'Regular', postscriptName: 'Arial', blob: regular },
      { family: 'Arial', style: 'Bold', postscriptName: 'Arial-Bold', blob: bold },
      { family: 'Other', style: 'Regular', postscriptName: 'Other', blob: other },
    ]);
    vi.stubGlobal('window', { queryLocalFonts });
    const requests = [{ family: 'arial', bold: false, italic: false, characters: 'Alice' }];
    expect((await readLocalFonts(requests))[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    await readLocalFonts(requests);
    expect(queryLocalFonts).toHaveBeenCalledTimes(1);
    expect(regular).toHaveBeenCalledTimes(1);
    expect(bold).not.toHaveBeenCalled();
    expect(other).not.toHaveBeenCalled();
  });
  it('recovers from permission denial on the next request', async () => {
    const queryLocalFonts = vi
      .fn<() => Promise<Face[]>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValue([]);
    vi.stubGlobal('window', { queryLocalFonts });
    expect(await readLocalFonts([])).toEqual([]);
    expect(await readLocalFonts([])).toEqual([]);
    expect(queryLocalFonts).toHaveBeenCalledTimes(2);
  });
});
