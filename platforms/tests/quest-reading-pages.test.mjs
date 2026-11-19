import assert from 'node:assert/strict';
import test from 'node:test';
import { roomReadingPages } from '../quest/room-reading.mjs';

test('headset pagination keeps every code point, source blank lines and word breaks', () => {
  const longLine = 'a'.repeat(47) + '𐅃' + 'β'.repeat(50) + ' an intact word on the next line';
  const lines = roomReadingPages(longLine + '\r\n\r\nEnd of verse').flat();
  assert.deepEqual(lines.slice(-2), ['', 'End of verse']);
  assert.equal(lines.slice(0, -2).join(''), longLine);
  assert.equal([...lines[0]].at(-1), '𐅃');
  assert(lines.every(line => [...line].length <= 48));
  const wrapped = roomReadingPages('a'.repeat(41) + ' wordAcrossBoundary').flat();
  assert.deepEqual(wrapped, ['a'.repeat(41) + ' ', 'wordAcrossBoundary']);
});

test('each headset page stays within the nine rendered rows', () => {
  const lines = Array.from({ length: 23 }, (_, index) => `Verse ${index + 1}`);
  const pages = roomReadingPages(lines.join('\n'));
  assert.deepEqual(pages.map(page => page.length), [9, 9, 5]);
  assert.deepEqual(pages.flat(), lines);
});
