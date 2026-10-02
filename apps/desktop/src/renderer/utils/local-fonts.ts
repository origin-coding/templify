import type { PdfFontData, PdfFontRequest } from '@templify/node-output';

interface LocalFontFace {
  readonly family: string;
  readonly style: string;
  readonly postscriptName: string;
  blob(): Promise<Blob>;
}
type FontWindow = Window & { queryLocalFonts?: () => Promise<readonly LocalFontFace[]> };
let faces: Promise<readonly LocalFontFace[]> | undefined;
const bytes = new Map<string, Promise<Uint8Array>>();

export function clearLocalFonts(): void {
  faces = undefined;
  bytes.clear();
}

export async function readLocalFonts(
  requests: readonly PdfFontRequest[],
): Promise<readonly PdfFontData[]> {
  const query = (window as FontWindow).queryLocalFonts;
  if (!query) return [];
  try {
    faces ??= query.call(window);
    const available = await faces;
    const results = await Promise.all(
      requests.map(async (request): Promise<PdfFontData | undefined> => {
        const match = available.find(
          (face) =>
            face.family.trim().toLowerCase() === request.family.trim().toLowerCase() &&
            /bold|black|heavy|semibold/i.test(face.style) === request.bold &&
            /italic|oblique/i.test(face.style) === request.italic,
        );
        if (!match) return undefined;
        try {
          let data = bytes.get(match.postscriptName);
          if (!data) {
            data = match
              .blob()
              .then((blob) => blob.arrayBuffer())
              .then((buffer) => new Uint8Array(buffer));
            bytes.set(match.postscriptName, data);
            void data.catch(() => bytes.delete(match.postscriptName));
          }
          return {
            family: request.family,
            bold: request.bold,
            italic: request.italic,
            bytes: await data,
          };
        } catch {
          /* Only this face falls back when reading it fails. */
        }
        return undefined;
      }),
    );
    return results.filter((font): font is PdfFontData => font !== undefined);
  } catch {
    faces = undefined;
    return [];
  }
}
