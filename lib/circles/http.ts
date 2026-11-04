// Small request helpers shared by the circles routes.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function safeJson(req: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return t ? t.slice(0, max) : null;
}
