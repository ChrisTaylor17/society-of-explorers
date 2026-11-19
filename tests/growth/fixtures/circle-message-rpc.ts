// Narrow service-boundary fixture for existing controller/identity tests.
// Real PostgreSQL authorization, locks, tombstones and raw-table guards are
// proved by the root message-moderation database/integration suites.
import type { FakeDb } from '../../security/fakes';
import { CIRCLE_BOOK_ID } from '../../../lib/circles/path';

export function installCircleMessageRpc(db: FakeDb) {
  Reflect.set(db, 'rpc', async (name: string, args: Record<string, string>) => {
    const cohort = db.rows('book_cohorts').find(row => row.id === args.p_circle_id && row.book_id === CIRCLE_BOOK_ID);
    if (!cohort || cohort.circle_hidden) return { data: null, error: { code: 'PT404' } };
    if (!db.rows('book_cohort_members').some(row => row.cohort_id === cohort.id && row.member_id === args.p_actor)) {
      return { data: null, error: { code: 'PT403' } };
    }
    if (name === 'soe_circle_messages_read_profiles') {
      const all = db.rows('seminar_messages').filter(row => row.cohort_id === cohort.id);
      return { data: {
        cohort: { id: cohort.id, book_id: cohort.book_id, title: cohort.title, description: cohort.description ?? null,
          max_members: cohort.max_members ?? null, start_date: cohort.start_date ?? null, thinker_id: cohort.thinker_id ?? null,
          status: cohort.status ?? null, created_at: cohort.created_at ?? null },
        members: db.rows('book_cohort_members').filter(row => row.cohort_id === cohort.id).map(row => ({ id: row.id,
          members: { display_name: db.rows('members').find(member => member.id === row.member_id)?.display_name ?? null } })),
        messages: all.slice(-100).map(row => ({ id: row.id, member_name: row.member_name, content: row.content,
          created_at: row.created_at, is_mine: row.member_id === args.p_actor, visibility: 'visible', publicProfileId: null })),
        history: { limit: 100, truncated: all.length > 100 },
      }, error: null };
    }
    if (name === 'soe_circle_messages_post') {
      const { data, error } = await db.from('seminar_messages').insert({ cohort_id: cohort.id, member_id: args.p_actor,
        member_name: args.p_member_name, content: args.p_content }).select().single();
      return { data: error ? null : { outcome: 'confirmed', circleId: cohort.id, message: { id: data.id, member_name: data.member_name,
        content: data.content, created_at: data.created_at, is_mine: true, visibility: 'visible', publicProfileId: null } }, error };
    }
    return { data: null, error: { code: 'PGRST202' } };
  });
}
