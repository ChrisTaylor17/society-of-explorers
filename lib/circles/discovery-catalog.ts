import { createHash } from 'node:crypto';
import { getBook } from '@/lib/books/catalog';
import { CIRCLE_PATH } from './path';
import { READING_EDITIONS } from './reading-program';
import type { DiscoveryQuery } from './discovery';

/** Metadata only: derive from the unchanged authoritative public reading sources. */
export const DISCOVERY_SEARCH_CATALOG = {
  version: 1,
  starter: CIRCLE_PATH.map(({ week, title, author, selection }) => ({ week, title, author, selection })),
  editions: READING_EDITIONS.map(edition => {
    const book = getBook(edition.bookId);
    if (!book) throw Error('Discovery book metadata unavailable');
    return { bookId: edition.bookId, editionId: edition.editionId, blockCount: edition.blockCount,
      title: book.title, author: book.author, sourceTitle: edition.sourceTitle,
      contents: edition.contents.map(({ readingIndex, label }) => ({ readingIndex, label })) };
  }),
};
export const DISCOVERY_CATALOG_HASH = createHash('sha256').update(JSON.stringify(DISCOVERY_SEARCH_CATALOG)).digest('hex');
export const DISCOVERY_UNICODE_VERSION = '17.0';
export const DISCOVERY_ICU_VERSION = '78.2';
// Both installed engines regenerated the entire scalar profile byte-identically.
export const DISCOVERY_VALIDATED_ICU_VERSIONS = ['78.1', '78.2'] as const;
export function assertDiscoveryUnicodeRuntime(): void {
  if (process.versions.unicode !== DISCOVERY_UNICODE_VERSION || !DISCOVERY_VALIDATED_ICU_VERSIONS.some(version => version === process.versions.icu)) throw Error('Discovery Unicode runtime unavailable');
}
/** SQL never interprets user strings as patterns, regular expressions or SQL. */
export function discoveryTerms(value: string): string[] {
  assertDiscoveryUnicodeRuntime();
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US').split(/\s+/u).filter(Boolean);
}
export function toDiscoverySqlQuery(query: DiscoveryQuery) {
  return { terms: discoveryTerms(query.q), cityTerms: discoveryTerms(query.city), format: query.format,
    open: query.open, sort: query.sort, book: query.book ?? null, edition: query.edition ?? null };
}
