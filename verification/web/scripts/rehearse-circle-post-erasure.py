"""Verify account erasure of Circle text and linked evidence on an isolated restore."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFTS = [ROOT / 'docs/sql' / name for name in (
    'account-deletion-requests-apply.sql', 'account-erasure-access-apply.sql',
    'account-erasure-private-data-apply.sql', 'account-erasure-circle-posts-apply.sql',
)]
SCHEMA = 'soe_account_deletion_private'
REQUEST = '72000000-0000-4000-8000-000000000001'
TAMPER = '72000000-0000-4000-8000-000000000002'
OTHER_REPLY = '72000000-0000-4000-8000-000000000003'
LEGACY_COHORT = '72000000-0000-4000-8000-000000000004'
DIGEST = hashlib.sha256(bytes([8]) * 32).hexdigest()
COPIED_NOTE = 'PRIVATE_SYNTHETIC_REVIEW_NOTE'
MODERATOR_SUMMARY = 'Synthetic reviewer considered the report.'
FORMER_NAME = 'Former member'
REMOVED = 'Removed with account deletion.'


def exercise(staged, original, database, owner, temp, release, harness, kit, report):
    checks = report['checks']
    reader, host, reviewer = (release[name] for name in ('READER', 'HOST', 'REVIEWER'))
    author_subject = harness['SECOND_AUTH_SUBJECT']

    def run(sql, *, role='postgres', sqlstate=None):
        return staged.query(database, f'SET ROLE {role};\n' + sql, owner, sqlstate=sqlstate)

    def rpc(action, *args, **kwargs):
        return release['invoke'](staged, database, owner, action, *args, **kwargs)

    circle, root_id, _, _, _, decision, _, _ = release['seed_circle'](run, rpc)
    draft_scope = f"'{REQUEST}','{reader}','{author_subject}'"
    source_text = release['POST']
    run(f"""
      INSERT INTO public.book_cohorts(id,book_id,thinker_id,title,created_by)
        VALUES ('{LEGACY_COHORT}','apology','socrates','Earlier book salon','{reader}');
      INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES ('{LEGACY_COHORT}','{reader}');
    """)
    run(f"SELECT public.soe_book_salon_messages_post('{reader}','{LEGACY_COHORT}','A legacy salon comment.','Reader')",
        role='service_role')
    before = rpc('discussion_thread', host, circle, root_id)
    assert len(before['items']) == 1 and before['items'][0]['content'] == 'A synthetic reply.'
    assert source_text in json.dumps(rpc('message_review_detail', reviewer, circle, root_id))
    for file in DRAFTS:
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', file)
        report['orderedMigrationFiles'].append(str(file.relative_to(ROOT)))
    assert len(report['orderedMigrationFiles']) == 52

    # A new reply in an ordinary thread still uses the original application RPC.
    live = rpc('discussion_target', host, circle, before['items'][0]['id'])['target']
    reply = rpc('discussion_post', host, circle, OTHER_REPLY, 'Keep another member reply.',
                before['items'][0]['id'], live['revision'], live['contentHash'], 'Host')
    assert reply['message']['parentMessageId'] == before['items'][0]['id']
    before = rpc('discussion_thread', host, circle, root_id)
    assert len(before['items']) == 2

    def safety_bodies():
        return run(f"""SELECT concat(
          (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)::text FROM seminar_messages m WHERE m.member_id='{reader}'),
          (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM circle_message_reports r WHERE r.message_id='{root_id}'),
          (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)::text FROM circle_message_decisions d WHERE d.message_id='{root_id}'),
          (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.request_id)::text FROM circle_message_receipts x WHERE x.payload->>'messageId'='{root_id}')
        )""")

    assert run(f"SELECT id FROM public.soe_account_deletion_request('supabase','{author_subject}','{REQUEST}','{DIGEST}',4)",
               role='service_role') == REQUEST
    preview = f'SELECT {SCHEMA}.preview_circle_posts({draft_scope})'
    run(preview, sqlstate='PT409')
    assert run(f'SELECT {SCHEMA}.start_erasure({draft_scope})')
    assert source_text in safety_bodies() and COPIED_NOTE in safety_bodies() and MODERATOR_SUMMARY in safety_bodies()

    def erase(scope, allow=True, **kwargs):
        allowed = 'true' if allow else 'false'
        return run(f"SELECT {SCHEMA}.erase_circle_posts({draft_scope},'{json.dumps(scope)}',{allowed})", **kwargs)

    scope = json.loads(run(preview))
    assert scope['posts'] == 2 and scope['reports'] == 1 and scope['decisions'] == 1
    assert scope['receipts'] == 2 and scope['consents'] == 1
    assert len(scope['snapshot']) == 64 and source_text not in json.dumps(scope)
    erase(scope, False, sqlstate='PT409')
    for role in ('anon', 'authenticated', 'service_role'):
        run(preview, role=role, sqlstate='42501')
        erase(scope, role=role, sqlstate='42501')
        run(f'SELECT * FROM {SCHEMA}.circle_post_targets', role=role, sqlstate='42501')
        run(f"INSERT INTO {SCHEMA}.circle_post_context VALUES(pg_current_xact_id(),'{REQUEST}')", role=role, sqlstate='42501')
    run(f"UPDATE public.seminar_messages SET content='{REMOVED}',member_name='{FORMER_NAME}',member_id=NULL,"
        f"sender_name=NULL,thinker_id=NULL,passage_reference=NULL WHERE id='{root_id}'", sqlstate='PT403')
    run(f"UPDATE public.seminar_messages SET content='tamper' WHERE id='{root_id}'", role='service_role', sqlstate='PT403')
    rpc('discussion_post', reader, circle, TAMPER, 'A held write after starting removal.',
        None, None, None, 'Reader', refusal='PT403')
    assert json.loads(run(preview)) == scope
    checks.append('The ordinary app can post as another member. Only an owner processing the exact request can erase, and linked evidence needs separate approval.')

    run(f"UPDATE public.circle_message_reports SET note='Revised evidence with the same count' WHERE message_id='{root_id}'")
    erase(scope, sqlstate='PT409')
    assert len(rpc('discussion_thread', host, circle, root_id)['items']) == 2
    run(f"UPDATE public.circle_message_reports SET note='{COPIED_NOTE}' WHERE message_id='{root_id}'")
    assert json.loads(run(preview)) == scope
    run(f"CREATE TABLE public.fixture_circle_dependency(id uuid PRIMARY KEY REFERENCES public.seminar_messages(id))")
    erase(scope, sqlstate='PT409')
    run('DROP TABLE public.fixture_circle_dependency')
    run('ALTER TABLE public.seminar_messages DISABLE TRIGGER circle_message_identity_immutable')
    erase(scope, sqlstate='PT409')
    run('ALTER TABLE public.seminar_messages ENABLE TRIGGER circle_message_identity_immutable')
    checks.append('Changed evidence, a new dependency or an inactive immutability guard invalidates the reviewed scope.')

    run(f'ALTER TABLE {SCHEMA}.circle_post_receipts ADD CONSTRAINT fixture_fail CHECK(false)')
    erase(scope, sqlstate='23514')
    assert json.loads(run(preview)) == scope
    assert source_text in safety_bodies() and MODERATOR_SUMMARY in safety_bodies()
    assert run(f'SELECT count(*) FROM {SCHEMA}.circle_post_context') == '0'
    assert run(f'SELECT count(*) FROM {SCHEMA}.circle_post_targets') == '0'
    run(f'ALTER TABLE {SCHEMA}.circle_post_receipts DROP CONSTRAINT fixture_fail')
    checks.append('A forced late receipt failure rolls back post, moderation, AI consent and temporary authorization changes.')

    lock_test = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))
    race = lock_test['race']
    race.__globals__['SOURCE'] = database
    race(staged, f"SET LOCAL ROLE postgres; SELECT {SCHEMA}.erase_circle_posts({draft_scope},'{json.dumps(scope)}',true);",
         f"SET ROLE service_role; INSERT INTO public.circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note) "
         f"VALUES ('{circle}','{root_id}','{host}','safety','late report with copied text');", 'PT403')
    cleared = erase(scope)
    assert run(f"SELECT cleared_at FROM {SCHEMA}.circle_post_receipts WHERE request_id='{REQUEST}'") == cleared
    checks.append('A new report waits on the independent erasure transaction, then cannot recreate a copy after commit.')
    assert run(f'SELECT count(*) FROM {SCHEMA}.circle_post_context') == '0'
    assert run(f'SELECT count(*) FROM {SCHEMA}.circle_post_targets WHERE request_id=\'{REQUEST}\'') == '2'
    assert run(f"SELECT count(*) FROM public.seminar_messages WHERE member_id='{reader}' AND cohort_id='{circle}'") == '0'
    assert run(f"SELECT content FROM public.seminar_messages WHERE member_id='{reader}' AND cohort_id='{LEGACY_COHORT}'") == 'A legacy salon comment.'
    thread = rpc('discussion_thread', host, circle, root_id)
    assert thread['items'] == before['items']
    assert thread['root']['member_name'] == FORMER_NAME and thread['root']['visibility'] == 'withdrawn'
    assert thread['root']['content'] is None and thread['root']['id'] == root_id
    archive = rpc('discussion_read', host, circle)
    assert source_text not in json.dumps(archive)
    assert [item for item in archive['items'] if item['visibility'] == 'withdrawn']
    assert rpc('discussion_target', host, circle, root_id, refusal='PT409') is None
    detail = rpc('message_review_detail', reviewer, circle, root_id)
    assert detail['message']['content'] == REMOVED and detail['message']['member_name'] == FORMER_NAME
    for secret in (source_text, COPIED_NOTE, MODERATOR_SUMMARY):
        assert secret not in safety_bodies() and secret not in json.dumps(detail)
    assert run(f"SELECT count(*) FROM public.circle_message_ai_attempts WHERE message_id='{root_id}'") == '1'
    assert run(f"SELECT count(*) FROM public.circle_message_ai_consents WHERE message_id='{root_id}'") == '0'
    assert run(f"SELECT count(*) FROM public.circle_review_coverage_sessions WHERE message_id='{root_id}' AND NOT invalidated") == '0'
    rpc('review_coverage_decide', *decision, refusal='PT409')
    rpc('review_coverage_start', reviewer, circle, root_id, detail['revision'], detail['contentHash'], refusal='PT403')
    run(f"UPDATE public.circle_message_reports SET note='Reinserted note' WHERE message_id='{root_id}'",
        role='service_role', sqlstate='PT403')
    run(f"UPDATE public.circle_message_states SET withdrawn=false WHERE message_id='{root_id}'",
        role='service_role', sqlstate='PT403')
    run(f"DELETE FROM public.circle_message_states WHERE message_id='{root_id}'", sqlstate='PT403')
    live_detail = rpc('message_review_detail', reviewer, circle, reply['message']['id'])
    assert rpc('review_coverage_start', reviewer, circle, reply['message']['id'], live_detail['revision'],
               live_detail['contentHash'])['totalReports'] == 0
    checks.append('The archive preserves other replies and the legacy salon. It keeps a neutral withdrawn anchor, clears linked text and rejects stale review while preserving the spent AI attempt.')

    archive_path = temp / 'circle-erasure-result.dump'
    staged.dump(database, archive_path)
    restore = 'soe_circle_post_erasure_restored'
    original.restore(restore, archive_path)
    replay = original.query(restore, f"SET ROLE postgres; SELECT {SCHEMA}.erase_circle_posts({draft_scope},'{json.dumps(scope)}',true)")
    assert replay == cleared
    restored = original.query(restore, f"SET ROLE service_role; SELECT public.soe_circle_discussion_thread('{host}','{circle}','{root_id}')")
    assert json.loads(restored) == thread
    assert original.query(restore, f"SET ROLE service_role; SELECT id FROM public.soe_account_deletion_status('{REQUEST}','{DIGEST}')") == REQUEST
    checks.append('A separate restore keeps the scrubbed thread and both receipts, including an exact retry of the owner operation.')


def main():
    os.umask(0o077)
    release = runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL','CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    report = {'checks': [], 'productionRestoreVerified': False}
    with TemporaryDirectory(prefix='soe-post-erasure-', dir='/private/tmp') as directory:
        temp = Path(directory)
        original, staged = [kit['Cluster'](temp / name, owner) for name in ('original','staged')]
        try:
            subprocess.run(['/opt/homebrew/bin/node','--require',str(release['NETWORK_GUARD']),
                            str(release['EXPORT_FIXTURE']),str(temp)], env=kit['ENV'],cwd=ROOT,
                           check=True, timeout=20, stdout=subprocess.DEVNULL)
            report['fixture'] = json.loads((temp / 'inputs.json').read_bytes())
            original.start()
            staged.start()
            release['stage_restored_release'](original, staged, database, temp, harness, kit, checker, report)
            exercise(staged, original, database, owner, temp, release, harness, kit, report)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    report.update(status='PASS', clustersStopped=True, temporaryDirectoryRemoved=True, draftSha256=kit['digest'](DRAFTS[-1]))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
