export interface DailyBreakdown {
  date: string;
  shorts: number;
  regular: number;
}

export interface ParsedData {
  totalVideos: number;
  totalShorts: number;
  regularVideos: number;
  estimatedMinutes: number;
  dailyBreakdown: DailyBreakdown[];
  dateRange: { start: string; end: string };
}

function isShort(url: string, title: string): boolean {
  return /\/shorts\//i.test(url) || /#shorts/i.test(title);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function parseWatchHistory(content: string, fileType: 'json' | 'html'): ParsedData {
  const entries: { timestamp: Date; isShort: boolean }[] = [];

  if (fileType === 'json') {
    try {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [];
      for (const item of items) {
        const time = item.time ? new Date(item.time) : null;
        if (!time || isNaN(time.getTime())) continue;
        const url = item.titleUrl || item.url || '';
        const title = item.title || '';
        entries.push({ timestamp: time, isShort: isShort(url, title) });
      }
    } catch {}
  } else {
    // HTML parsing
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const cells = doc.querySelectorAll('.content-cell');
      for (const cell of cells) {
        const links = cell.querySelectorAll('a');
        const url = links[0]?.getAttribute('href') || '';
        const title = links[0]?.textContent || '';
        // Timestamp is usually the last text node
        const textNodes = Array.from(cell.childNodes).filter(n => n.nodeType === 3);
        const timeText = textNodes[textNodes.length - 1]?.textContent?.trim() || '';
        const time = timeText ? new Date(timeText) : null;
        if (!time || isNaN(time.getTime())) continue;
        entries.push({ timestamp: time, isShort: isShort(url, title) });
      }
      // Fallback: try divs with links
      if (entries.length === 0) {
        const divs = doc.querySelectorAll('div');
        for (const div of divs) {
          const link = div.querySelector('a[href*="youtube.com/watch"], a[href*="youtube.com/shorts"]');
          if (!link) continue;
          const url = link.getAttribute('href') || '';
          const title = link.textContent || '';
          const text = div.textContent || '';
          const dateMatch = text.match(/\w+ \d+, \d{4},? \d+:\d+:\d+ [AP]M/);
          const time = dateMatch ? new Date(dateMatch[0]) : null;
          if (!time || isNaN(time.getTime())) continue;
          entries.push({ timestamp: time, isShort: isShort(url, title) });
        }
      }
    } catch {}
  }

  if (entries.length === 0) {
    return { totalVideos: 0, totalShorts: 0, regularVideos: 0, estimatedMinutes: 0, dailyBreakdown: [], dateRange: { start: '', end: '' } };
  }

  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const totalShorts = entries.filter(e => e.isShort).length;
  const regularVideos = entries.length - totalShorts;
  const estimatedMinutes = Math.round(totalShorts * 0.5 + regularVideos * 5);

  // Daily breakdown
  const dailyMap = new Map<string, { shorts: number; regular: number }>();
  for (const e of entries) {
    const day = formatDate(e.timestamp);
    const existing = dailyMap.get(day) || { shorts: 0, regular: 0 };
    if (e.isShort) existing.shorts++; else existing.regular++;
    dailyMap.set(day, existing);
  }

  const dailyBreakdown = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalVideos: entries.length,
    totalShorts,
    regularVideos,
    estimatedMinutes,
    dailyBreakdown,
    dateRange: {
      start: formatDate(entries[0].timestamp),
      end: formatDate(entries[entries.length - 1].timestamp),
    },
  };
}
