// Public salon projection. Circle discussions use their separate member-only
// protocol; neither reader accepts raw identity or account columns.
export type SalonMessage = { id: string; member_name: string; content: string; content_available: boolean;
  created_at: string | null; is_mine: boolean };
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, limit: number, single = false): v is string => typeof v === 'string' && v.length <= limit
  && !(single ? /[\u0000-\u001f\u007f]/ : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/).test(v)
  && !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(v);
const time = (v: unknown) => v === null || (text(v, 64, true) && Number.isFinite(Date.parse(v)));
export function parseSalonMessage(value: unknown, own = false): SalonMessage | null {
  if (!record(value) || !id(value.id) || !text(value.member_name, 200, true) || !value.member_name.trim()
    || value.member_name.includes('@') || !text(value.content, 2000) || typeof value.content_available !== 'boolean'
    || (!value.content_available && value.content !== '[Message unavailable.]') || !time(value.created_at)
    || typeof value.is_mine !== 'boolean' || (own && (!value.is_mine || !value.content_available || value.created_at === null))) return null;
  return { id: value.id, member_name: value.member_name, content: value.content, content_available: value.content_available,
    created_at: value.created_at as string | null, is_mine: value.is_mine };
}
export function parseSalonConversation(value: unknown, cohortId: string) {
  if (!record(value) || !record(value.cohort) || value.cohort.id !== cohortId || !text(value.cohort.book_id, 200, true)
    || value.cohort.book_id === 'soe-circles-path' || !Array.isArray(value.members) || value.members.length > 50
    || !Number.isSafeInteger(value.membership_count) || Number(value.membership_count) < value.members.length
    || !record(value.roster) || value.roster.limit !== 50 || typeof value.roster.truncated !== 'boolean'
    || (value.roster.truncated && value.members.length !== 50) || !Array.isArray(value.messages) || value.messages.length > 100
    || !record(value.history) || value.history.limit !== 100 || value.history.window !== 'latest' || typeof value.history.truncated !== 'boolean'
    || (value.history.truncated && value.messages.length !== 100)) return null;
  const c = value.cohort;
  if ((c.title !== null && !text(c.title, 200, true)) || (c.description !== null && !text(c.description, 2000))
    || (c.max_members !== null && (!Number.isSafeInteger(c.max_members) || Number(c.max_members) < 1))
    || (c.start_date !== null && !text(c.start_date, 64, true)) || (c.thinker_id !== null && !text(c.thinker_id, 100, true))
    || (c.status !== null && !text(c.status, 40, true)) || !time(c.created_at)) return null;
  const memberIds = new Set<string>(), messageIds = new Set<string>();
  const members: { id: string; members: { display_name: string } }[] = [], messages: SalonMessage[] = [];
  for (const member of value.members) {
    if (!record(member) || !id(member.id) || memberIds.has(member.id) || !record(member.members)
      || !text(member.members.display_name, 200, true) || !member.members.display_name.trim() || member.members.display_name.includes('@')) return null;
    memberIds.add(member.id); members.push({ id: member.id, members: { display_name: member.members.display_name } });
  }
  for (const row of value.messages) {
    const message = parseSalonMessage(row);
    if (!message || messageIds.has(message.id)) return null;
    messageIds.add(message.id); messages.push(message);
  }
  return { cohort: { id: cohortId, book_id: c.book_id, title: c.title as string | null, description: c.description as string | null,
    max_members: c.max_members as number | null, start_date: c.start_date as string | null, thinker_id: c.thinker_id as string | null,
    status: c.status as string | null, created_at: c.created_at as string | null }, members, membership_count: Number(value.membership_count),
  roster: { limit: 50 as const, truncated: value.roster.truncated }, messages,
  history: { limit: 100 as const, window: 'latest' as const, truncated: value.history.truncated } };
}
export function parseSalonPost(value: unknown): { content: string; expectedMemberId: string } | null {
  if (!record(value) || Object.keys(value).length !== 2 || !Object.keys(value).every(k => ['content', 'expectedMemberId'].includes(k))
    || !id(value.expectedMemberId) || !text(value.content, 2000) || !value.content.trim()) return null;
  return { content: value.content.trim(), expectedMemberId: value.expectedMemberId.toLowerCase() };
}
