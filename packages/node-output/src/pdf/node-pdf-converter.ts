import {
  FontRegistry,
  Ream,
  isEmbeddingRestricted,
  readOs2FsType,
  resolveFamilyKey,
  type FontBytesByVariant,
  type FlowDoc,
} from 'reamkit';
import type { BodyElement, Run } from 'reamkit/document-model';
import type { PdfConverter, PdfConversionLoss } from '@templify/core';
import { createRemoteFontCache, defaultFontCacheDirectory, validFontBytes } from './font-cache';

export interface PdfFontRequest {
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly characters: string;
}
export interface PdfFontData {
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly bytes: Uint8Array;
}
export interface NodePdfConverterOptions {
  readonly cacheDirectory?: string;
  readonly localFonts?: (requests: readonly PdfFontRequest[]) => Promise<readonly PdfFontData[]>;
  readonly fetchFont?: (url: string) => Promise<Uint8Array>;
  readonly onDownload?: () => void;
}

const remoteFamilies = {
  arimo: ['arimo', 'Arimo'],
  tinos: ['tinos', 'Tinos'],
  cousine: ['cousine', 'Cousine'],
  carlito: ['carlito', 'Carlito'],
  caladea: ['caladea', 'Caladea'],
} as const;
const scriptFamilies = {
  sc: ['noto-sans-sc', 'NotoSansSC'],
  jp: ['noto-sans-jp', 'NotoSansJP'],
  kr: ['noto-sans-kr', 'NotoSansKR'],
  arabic: ['noto-sans-arabic', 'NotoSansArabic'],
  hebrew: ['noto-sans-hebrew', 'NotoSansHebrew'],
  thai: ['noto-sans-thai', 'NotoSansThai'],
  symbols1: ['noto-sans-symbols', 'NotoSansSymbols'],
  symbols2: ['noto-sans-symbols-2', 'NotoSansSymbols2'],
} as const;

/** Node orchestration accepts external font bytes and has no Electron dependency. */
export function createNodePdfConverter(options: NodePdfConverterOptions = {}): PdfConverter {
  const fetchFont = createRemoteFontCache({
    directory: options.cacheDirectory ?? defaultFontCacheDirectory(),
    ...(options.fetchFont ? { fetch: options.fetchFont } : {}),
    ...(options.onDownload ? { onDownload: options.onDownload } : {}),
  });
  return {
    id: 'reamkit',
    async getAvailability() {
      return { available: true };
    },
    async convert(docx) {
      const parsed = Ream.parse(docx);
      const requests = collectFontRequests(parsed.flow);
      const losses: PdfConversionLoss[] = [];
      let supplied: readonly PdfFontData[] = [];
      try {
        supplied = (await options.localFonts?.(requests)) ?? [];
      } catch {
        /* Local permission/read failures fall through to remote fallback. */
      }
      const external = new Map<string, Partial<FontBytesByVariant>>();
      for (const font of supplied) {
        if (
          !requests.some((request) => normalize(request.family) === normalize(font.family)) ||
          !validFontBytes(font.bytes) ||
          isEmbeddingRestricted(readOs2FsType(font.bytes))
        )
          continue;
        const name = normalize(font.family);
        const variants = external.get(name) ?? {};
        const variant = font.bold
          ? font.italic
            ? 'boldItalic'
            : 'bold'
          : font.italic
            ? 'italic'
            : 'regular';
        external.set(name, { ...variants, [variant]: font.bytes });
      }
      const exact = new Map<string, FontRegistry>();
      for (const [name, variants] of external) {
        // A selected bold face can serve as the regular fallback for a bold-only family.
        const regular = variants.regular ?? variants.bold ?? variants.italic ?? variants.boldItalic;
        if (!regular) continue;
        try {
          exact.set(name, FontRegistry.fromBytes({ ...variants, regular }));
        } catch {
          /* An unreadable local face is not a conversion failure. */
        }
      }
      for (const [name, registry] of parsed.flow.embeddedFonts ?? []) exact.set(name, registry);
      const byFamily = new Map<
        keyof typeof remoteFamilies | keyof typeof scriptFamilies,
        FontRegistry
      >();
      let fallback: FontBytesByVariant | undefined;
      for (const request of requests) {
        const name = normalize(request.family);
        if (exact.has(name)) {
          const local = exact.get(name)!;
          const key = resolveFamilyKey(request.family);
          if (!byFamily.has(key)) byFamily.set(key, local);
          for (const character of request.characters) {
            if (
              !ignorable(character) &&
              character.codePointAt(0)! > 0x024f &&
              local
                .resolveByStyle(request.bold, request.italic)
                .parsed.glyphForCodepoint(character.codePointAt(0)!) !== 0
            )
              byFamily.set(scriptForCharacter(character), local);
          }
          if (!fallback) {
            const registry = exact.get(name)!;
            fallback = { regular: registry.resolveByStyle(false, false).parsed.raw };
          }
          continue;
        }
        const key = resolveFamilyKey(request.family);
        if (!byFamily.has(key)) {
          try {
            // Preserve family preference order and avoid duplicate downloads for shared keys.
            // eslint-disable-next-line no-await-in-loop
            const variants = await remoteSet(key);
            byFamily.set(key, FontRegistry.fromBytes(variants));
            fallback ??= variants;
          } catch {
            /* Another available font may still cover this family's text. */
          }
        }
        losses.push({
          severity: 'substituted',
          feature: 'font',
          detail: `${request.family} rendered with ${key}.`,
        });
      }
      if (!fallback) {
        fallback = await remoteSet('arimo');
        byFamily.set('arimo', FontRegistry.fromBytes(fallback));
      }
      const glyphs = (registry: FontRegistry, request: PdfFontRequest, cp: number): boolean =>
        registry.resolveByStyle(request.bold, request.italic).parsed.glyphForCodepoint(cp) !== 0;
      const all = [...exact.values(), ...byFamily.values()];
      const missing = new Set<string>();
      for (const request of requests)
        for (const character of request.characters) {
          const cp = character.codePointAt(0)!;
          if (ignorable(character)) continue;
          const preferred =
            exact.get(normalize(request.family)) ?? byFamily.get(resolveFamilyKey(request.family));
          if (preferred && glyphs(preferred, request, cp)) continue;
          if (all.some((registry) => glyphs(registry, request, cp))) continue;
          missing.add(character);
        }
      await Promise.all(
        [...new Set([...missing].map(scriptForCharacter))].map(async (script) => {
          const [pkg, file] = scriptFamilies[script];
          try {
            const bytes = await fetchFont(remoteUrl(pkg, file, 'regular', true));
            byFamily.set(script, FontRegistry.fromBytes({ regular: bytes }));
            losses.push({
              severity: 'substituted',
              feature: 'font',
              detail: `Fallback font ${file} was used for missing characters.`,
            });
          } catch {
            /* The final glyph check reports an unusable fallback. */
          }
        }),
      );
      // All local fonts also participate in glyph fallback without persistent storage.
      const fallbackRegistry = FontRegistry.fromBytes(fallback);
      for (const request of requests)
        for (const character of request.characters) {
          if (ignorable(character)) continue;
          const cp = character.codePointAt(0)!;
          if (
            ![...exact.values(), ...byFamily.values(), fallbackRegistry].some((registry) =>
              glyphs(registry, request, cp),
            )
          )
            throw new Error(`No usable PDF font for U+${cp.toString(16).toUpperCase()}.`);
        }
      const result = await parsed.convertWithReport('pdf', {
        fonts: fallback,
        embeddedFonts: exact,
        registriesByFamily: byFamily,
      });
      return { bytes: new Uint8Array(result.bytes), losses: [...result.losses, ...losses] };
    },
  };

  async function remoteSet(key: keyof typeof remoteFamilies): Promise<FontBytesByVariant> {
    const [pkg, file] = remoteFamilies[key];
    const regular = await fetchFont(remoteUrl(pkg, file, 'regular', pkg === 'carlito'));
    const variants: FontBytesByVariant = { regular };
    const faces = await Promise.all(
      (['bold', 'italic', 'boldItalic'] as const).map(async (variant) => {
        try {
          return [
            variant,
            await fetchFont(remoteUrl(pkg, file, variant, pkg === 'carlito')),
          ] as const;
        } catch {
          return undefined;
        }
      }),
    );
    return { ...variants, ...Object.fromEntries(faces.filter((face) => face !== undefined)) };
  }
}

function remoteUrl(
  pkg: string,
  file: string,
  variant: 'regular' | 'bold' | 'italic' | 'boldItalic',
  nested: boolean,
): string {
  const suffix = {
    regular: '400Regular',
    bold: '700Bold',
    italic: '400Regular_Italic',
    boldItalic: '700Bold_Italic',
  }[variant];
  return `https://cdn.jsdelivr.net/npm/@expo-google-fonts/${pkg}/${nested ? `${suffix}/` : ''}${file}_${suffix}.ttf`;
}
function normalize(family: string): string {
  return family.trim().toLowerCase();
}
function ignorable(character: string): boolean {
  return /[\s\p{Cc}\p{Cf}]/u.test(character);
}
function scriptForCharacter(character: string): keyof typeof scriptFamilies {
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) return 'jp';
  if (/\p{Script=Hangul}/u.test(character)) return 'kr';
  if (/\p{Script=Han}/u.test(character)) return 'sc';
  if (/\p{Script=Arabic}/u.test(character)) return 'arabic';
  if (/\p{Script=Hebrew}/u.test(character)) return 'hebrew';
  if (/\p{Script=Thai}/u.test(character)) return 'thai';
  return character.codePointAt(0)! >= 0x1f000 ? 'symbols2' : 'symbols1';
}

/** Inspect the selected library's resolved model, never raw DOCX XML. */
export function collectFontRequests(flow: FlowDoc): readonly PdfFontRequest[] {
  const requests = new Map<string, PdfFontRequest>();
  function add(run: Run): void {
    const text = run.text;
    if (!text) return;
    const families = run.properties.fontFamily;
    const east = families?.eastAsia;
    const ordinary =
      families?.ascii ??
      families?.hAnsi ??
      flow.styles.defaultRunProperties.fontFamily?.ascii ??
      'Arial';
    const groups = new Map<string, string>();
    for (const character of text) {
      const family =
        east &&
        /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)
          ? east
          : ordinary;
      groups.set(family, (groups.get(family) ?? '') + character);
    }
    for (const [family, characters] of groups) {
      const bold = run.properties.bold ?? false;
      const italic = run.properties.italic ?? false;
      const key = JSON.stringify([normalize(family), bold, italic]);
      const previous = requests.get(key);
      requests.set(key, {
        family,
        bold,
        italic,
        characters: [...new Set((previous?.characters ?? '') + characters)].join(''),
      });
    }
  }
  function visit(elements: readonly BodyElement[]): void {
    for (const element of elements) {
      if (element.kind === 'paragraph') for (const run of element.paragraph.runs) add(run);
      else if (element.kind === 'table')
        for (const row of element.table.rows) for (const cell of row.cells) visit(cell.content);
      else if (element.kind === 'shape') visitShape(element.shape);
    }
  }
  function visitShape(shape: Extract<BodyElement, { kind: 'shape' }>['shape']): void {
    if (shape.text) visit(shape.text.content);
    for (const child of shape.children ?? []) visitShape(child.shape);
  }
  visit(flow.body);
  for (const bands of [flow.headersFooters, flow.footnotes, flow.endnotes])
    for (const elements of bands?.values() ?? []) visit(elements);
  for (const comment of flow.comments?.values() ?? []) visit(comment.content);
  return [...requests.values()];
}
