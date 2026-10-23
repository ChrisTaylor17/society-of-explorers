// S5 (medium): renderMarkdown output goes into dangerouslySetInnerHTML, and model
// or member text was not escaped, so <img onerror> / <script> could execute.
import { test, expect } from 'bun:test';
import { renderMarkdown } from '../../lib/renderMarkdown';

test('raw HTML is escaped', () => {
  const out = renderMarkdown('hi <img src=x onerror=alert(1)> <script>alert(2)</script>');
  expect(out).not.toContain('<img');
  expect(out).not.toContain('<script');
  expect(out).toContain('&lt;img');
});
test('attribute breakouts are escaped', () => {
  const out = renderMarkdown('**"><svg onload=alert(1)>**');
  expect(out).not.toContain('<svg');
  expect(out).toContain('&quot;&gt;');
});
test('markdown still renders', () => {
  const out = renderMarkdown('## Title\n**bold** and *it* & more\n- item');
  expect(out).toContain('<strong');
  expect(out).toContain('<em>it</em>');
  expect(out).toContain('&amp; more');
  expect(out).toContain('⬡');
});
