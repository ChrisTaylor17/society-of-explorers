// lib/renderMarkdown.ts
// Lightweight markdown-to-HTML for thinker responses and ritual artifacts.
// Handles: **bold**, *italic*, headers (##), bullet lists, line breaks.
// No external dependencies.

export function renderMarkdown(text: string): string {
  if (!text) return '';

  return text
    // Headers: ## Title → styled header
    .replace(/^### (.+)$/gm, '<div style="font-family:Cinzel,serif;font-size:10px;letter-spacing:0.15em;color:#c9a84c;margin:20px 0 8px;opacity:0.8">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-family:Cinzel,serif;font-size:11px;letter-spacing:0.15em;color:#c9a84c;margin:24px 0 10px">$1</div>')
    // Bold wrapped in stars: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#c9a84c;font-weight:600">$1</strong>')
    // Italic: *text*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Bullet points: - item or * item
    .replace(/^[-*] (.+)$/gm, '<div style="padding-left:16px;margin:4px 0">⬡ <span style="opacity:0.9">$1</span></div>')
    // Double newlines → paragraph breaks
    .replace(/\n\n/g, '<div style="margin:12px 0"></div>')
    // Single newlines → line breaks
    .replace(/\n/g, '<br/>');
}
