import 'server-only';
import selections from './text-selections.json';
import { resolvePassage } from '@/lib/books/passage-source';
import { passageComposeHref } from '@/lib/books/passages';
import { approvedMedia } from './server';
import type { ClipCatalog, TextClip } from './contracts';

/** Text comes from the existing hash-pinned edition resolver, not duplicated
 * quotation strings. A changed/missing source makes only that card unavailable. */
export async function clipCatalog(): Promise<ClipCatalog> {
  const textResults = await Promise.allSettled(selections.map(async selection => {
    const source = await resolvePassage(selection.reference);
    if (!source.quote) throw Error('Source passage unavailable');
    return { id: selection.id, title: selection.title, quote: source.quote, credit: source.metadata.edition.attribution,
      readerHref: source.readerHref, discussHref: passageComposeHref(source.reference), licenseNotice: source.metadata.edition.licenseNotice,
      licenseUrl: source.metadata.edition.licenseUrl, sourcePage: source.metadata.edition.sourceCatalogUrl } satisfies TextClip;
  }));
  return { version: 1, texts: textResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : []), media: await approvedMedia() };
}
