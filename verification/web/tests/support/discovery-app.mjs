import { participationApp, IDS } from './participation-app.mjs';
import { requestId } from './participation-db.mjs';
export { IDS, requestId };

// Actual Route Handler and candidate SQL. Only canonical identity and the
// PostgREST transport are synthetic. No live project, credential or provider.
export async function discoveryApp() {
  const base = await participationApp();
  let transform = null, sequence = 0;
  const originalRpc = base.admin.rpc;
  base.admin.rpc = async (name, args) => {
    const result = await originalRpc(name, args);
    return transform ? transform(name, args, result) : result;
  };
  async function seedCircles(count = 30, options = {}) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 500) throw Error('Bounded synthetic discovery seed only');
    const first = sequence + 1; sequence += count;
    const ended = options.ended === true;
    const format = options.format ?? 'in_person';
    if (!['in_person', 'online', 'hybrid'].includes(format)) throw Error('Unexpected fixture format');
    const result = await base.db.query(`INSERT INTO book_cohorts(id,book_id,title,description,max_members,start_date,status,created_by,
      circle_format,circle_city,circle_region,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_path_id,circle_hidden,circle_reading_program)
      SELECT ('d1500000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'soe-circles-path',
      $1||CASE WHEN $2::boolean THEN '' ELSE ' '||lpad(i::text,4,'0') END,$3,$4,
      (CURRENT_DATE+CASE WHEN $5::boolean THEN -365 ELSE 14 END)::timestamp AT TIME ZONE 'UTC',
      'forming',$6,$7,$8,$9,CASE WHEN $7='online' THEN NULL ELSE 'Synthetic public library' END,
      CASE WHEN $7='online' THEN 'online' ELSE 'library' END,
      extract(dow FROM CURRENT_DATE+CASE WHEN $5::boolean THEN -365 ELSE 14 END)::smallint,
      '19:00','UTC',CASE WHEN $12::jsonb IS NULL THEN 'starter-12' ELSE 'book-v1' END,false,$12::jsonb
      FROM generate_series($10::int,$11::int)i RETURNING id`, [
      options.title ?? 'Synthetic searchable Circle', options.sameTitle === true,
      options.description ?? 'A welcoming fictional reading discussion.', options.maxMembers ?? 8, ended,
      options.host ?? IDS.host, format, options.city ?? 'Montréal', options.region ?? 'Québec', first, sequence, options.readingProgram ?? null,
    ]);
    const ids = result.rows.map(row => row.id);
    if (format !== 'in_person') for (const id of ids) {
      await base.db.query('INSERT INTO circle_private(cohort_id,online_url) VALUES($1,$2)', [id, 'https://meet.example.invalid/SYNTHETIC_PRIVATE_LINK']);
    }
    return ids;
  }
  async function excludeOriginalCircles() {
    await base.db.query("UPDATE book_cohorts SET status='completed' WHERE id IN($1,$2)", [IDS.circle, IDS.circle2]);
  }
  return { ...base, seedCircles, excludeOriginalCircles, transformRpc: value => { transform = value; } };
}
