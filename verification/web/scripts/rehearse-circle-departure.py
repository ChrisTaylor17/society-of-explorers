"""Rehearse reviewed Circle retirement and membership removal on an isolated restore."""
from hashlib import sha256
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
SCHEMA = 'soe_account_deletion_private'
REQUEST = '74000000-0000-4000-8000-000000000001'
LEGACY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
OTHER_LINK = 'https://meeting.fixture.invalid/separate-salon'
DIGEST = sha256(bytes([10]) * 32).hexdigest()


def exercise(staged, original, database, owner, temp, release, harness, kit, drafts, report):
    host, reader = (release[name] for name in ('HOST', 'READER'))
    subject = harness['AUTH_SUBJECT']
    reviewed = f"'{REQUEST}','{host}','{subject}'"
    checks = report['checks']

    def key(number):
        return f'74000000-0000-4000-8000-{number:012d}'

    def run(sql, *, role='postgres', sqlstate=None):
        return staged.query(database, f'SET ROLE {role};\n' + sql, owner, sqlstate=sqlstate)

    def rpc(action, *args, **kwargs):
        return release['invoke'](staged, database, owner, action, *args, **kwargs)

    hosted, root, _, _, attendance, _, second_hosted, _ = release['seed_circle'](run, rpc)
    original_thread = rpc('discussion_thread', reader, hosted, root)
    day, weekday = run("SELECT CURRENT_DATE+1,extract(dow FROM CURRENT_DATE+1)::int").split('|')
    template = {
        'title': 'Synthetic independent salon', 'description': None, 'format': 'online',
        'city': None, 'region': None, 'venueName': None, 'venueType': 'online',
        'weekday': int(weekday), 'time': '20:00', 'timezone': 'UTC', 'startDate': day,
        'maxMembers': 8, 'onlineUrl': OTHER_LINK,
    }
    other = rpc('create', reader, key(2), template)
    elsewhere = other['circleId']
    reviewer_circle = rpc('create', reader, key(3), {**template, 'title': 'Separate review Circle'})['circleId']
    joined = rpc('join', host, elsewhere, other['state']['revision'], key(4))
    rpc('rsvp', host, elsewhere, joined['state']['revision'], key(5), day, 'going')
    run(f"INSERT INTO public.circle_reviewer_grants(cohort_id,member_id) VALUES ('{reviewer_circle}','{host}')")
    assert rpc('review_detail', host, reviewer_circle)
    for circle, lease in ((hosted,key(6)),(elsewhere,key(7))):
        assert rpc('salon_presence', host, circle, lease, 'reserve')['state'] == 'reserved'
        assert rpc('salon_presence', host, circle, lease, 'sync')['state'] == 'present'
    assert rpc('detail', reader, hosted)['online_url'] == release['MEETING']
    assert rpc('detail', reader, elsewhere)['online_url'] == OTHER_LINK
    run(f"UPDATE public.members SET email='old-host@fixture.invalid' WHERE id='{host}'")

    for file in drafts:
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', file)
        report['orderedMigrationFiles'].append(str(file.relative_to(ROOT)))
    assert len(report['orderedMigrationFiles']) == 54

    preview = f'SELECT {SCHEMA}.preview_circle_departure({reviewed})'
    run(preview, sqlstate='PT409')
    assert run(f"SELECT id FROM public.soe_account_deletion_request('supabase','{subject}','{REQUEST}','{DIGEST}',4)",
               role='service_role') == REQUEST
    lock_test = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))
    race = lock_test['race']
    race.__globals__['SOURCE'] = database
    race(staged, f'SET LOCAL ROLE postgres; SELECT {SCHEMA}.start_erasure({reviewed});',
         f"SET ROLE service_role; INSERT INTO public.book_cohort_members(cohort_id,member_id) "
         f"VALUES ('{reviewer_circle}','{host}');", 'PT403')
    run(f"UPDATE public.circle_private SET online_url='https://changed.fixture.invalid' WHERE cohort_id='{hosted}'",
        sqlstate='PT403')
    run(f"DELETE FROM public.circle_participation_receipts WHERE actor_member_id='{host}'", sqlstate='PT403')
    rpc('join', host, reviewer_circle, rpc('detail', reader, reviewer_circle)['revision'], key(8), refusal='PT403')
    checks.append('The processing boundary rejects an in-flight membership and stale changes to participation and hosted links.')

    previous_scopes = {}
    for name in ('private_data', 'circle_posts', 'contact_data'):
        previous_scopes[name] = run(f'SELECT {SCHEMA}.preview_{name}({reviewed})')
        approval = '' if name == 'private_data' else ',true'
        run(f"SELECT {SCHEMA}.erase_{name}({reviewed},'{previous_scopes[name]}'{approval})")
    before_thread = rpc('discussion_thread', reader, hosted, root)
    assert before_thread['root'] == original_thread['root'] and before_thread['items'] != original_thread['items']
    assert run(f"SELECT email IS NULL FROM public.members WHERE id='{host}'") == 't'
    assert run(f"SELECT count(*) FROM public.seminar_messages WHERE cohort_id='{LEGACY}' AND member_id='{host}'") == '0'
    checks.append('The same request advances through the earlier private, post and contact phases before handling Circle relationships.')

    def erase(scope, approved=True, **kwargs):
        return run(f"SELECT {SCHEMA}.erase_circle_departure({reviewed},'{json.dumps(scope)}',{str(approved).lower()})", **kwargs)

    scope = json.loads(run(preview))
    assert scope['hostedIds'] == sorted([hosted, second_hosted, LEGACY])
    assert scope['circleIds'] == sorted([hosted, second_hosted, elsewhere])
    counts = scope['counts']
    assert counts['reviewerGrant'] == 1 and counts['presence'] == 2 and counts['rsvp'] == 1, scope
    assert counts['meetingLink'] == 2 and counts['membership'] >= 3 and counts['receipt'] >= 4, scope
    assert release['MEETING'] not in json.dumps(scope) and len(scope['snapshot']) == 64
    erase(scope, False, sqlstate='PT409')
    run(f"SELECT {SCHEMA}.preview_circle_departure('{REQUEST}','{reader}','{subject}')", sqlstate='PT409')
    for role in ('anon','authenticated','service_role'):
        run(preview, role=role, sqlstate='42501')
        erase(scope, role=role, sqlstate='42501')
        run(f'SELECT * FROM {SCHEMA}.circle_departure_receipts', role=role, sqlstate='42501')
        run(f"INSERT INTO {SCHEMA}.circle_departure_context VALUES(pg_current_xact_id(),'{REQUEST}')",
            role=role, sqlstate='42501')
    checks.append('Only the owner can use the exact request and scope. Any hosted disposition needs explicit approval.')

    reader_state = rpc('detail', reader, hosted)
    rpc('rsvp', reader, hosted, reader_state['revision'], key(9), attendance[4], 'not_going')
    erase(scope, sqlstate='PT409')
    scope = json.loads(run(preview))
    run('ALTER TABLE public.circle_rsvps DISABLE TRIGGER soe_guard_circle_departure')
    erase(scope, sqlstate='PT409')
    run('ALTER TABLE public.circle_rsvps ENABLE TRIGGER soe_guard_circle_departure')
    run('CREATE TABLE public.fixture_unknown_link (id uuid REFERENCES public.circle_private(cohort_id) ON DELETE CASCADE)')
    erase(scope, sqlstate='PT409')
    run('DROP TABLE public.fixture_unknown_link')
    assert json.loads(run(preview)) == scope
    checks.append('A changed Circle revision, disabled guard or unknown cascade stops the operation before data changes.')

    run(f'ALTER TABLE {SCHEMA}.circle_departure_receipts ADD CONSTRAINT fixture_failure CHECK(false)')
    erase(scope, sqlstate='23514')
    assert json.loads(run(preview)) == scope
    assert rpc('detail', reader, hosted)['online_url'] == release['MEETING']
    assert run(f'SELECT count(*) FROM {SCHEMA}.circle_departure_context') == '0'
    run(f'ALTER TABLE {SCHEMA}.circle_departure_receipts DROP CONSTRAINT fixture_failure')
    checks.append('A late receipt error rolls back the membership, attendance, grant, link and host changes together.')

    before_other = rpc('detail', reader, elsewhere)
    before_closed = rpc('detail', reader, hosted)
    finished = erase(scope)
    assert erase(scope) == finished and json.loads(run(preview))['counts'] == {}
    erase(scope, False, sqlstate='PT409')
    closed = rpc('detail', reader, hosted)
    assert closed['ended'] is True and closed['circle']['status'] == 'completed'
    assert closed['online_url'] is None and closed['meetings'] == []
    assert closed['viewer']['is_member'] and not closed['viewer']['is_host']
    assert closed['revision'] == before_closed['revision'] + 1 and closed['memberCount'] == before_closed['memberCount'] - 1
    assert closed['capabilities']['canReadConversation'] and not closed['capabilities']['canRsvp']
    assert rpc('detail_profiles', reader, hosted) == {**closed, 'publicProfileId': None}
    assert rpc('discussion_thread', reader, hosted, root) == before_thread
    assert any(row['kind']=='circle' and row['circle']['id']==hosted for row in rpc('my_circles', reader)['items'])
    rpc('membership_state', host, hosted, refusal='PT404')
    rpc('review_detail', host, reviewer_circle, refusal='PT403')
    run(f"INSERT INTO public.circle_private(cohort_id,online_url) VALUES ('{hosted}','{OTHER_LINK}')",
        role='service_role', sqlstate='PT403')
    other_state = rpc('detail', reader, elsewhere)
    assert other_state['online_url'] == OTHER_LINK and other_state['ended'] is False
    assert other_state['revision'] == before_other['revision'] + 1 and other_state['memberCount'] == before_other['memberCount'] - 1
    assert run(f"SELECT count(*) FROM public.circle_rsvps WHERE cohort_id='{hosted}' AND member_id='{reader}' AND status='not_going'") == '1'
    assert run(f"SELECT count(*) FROM public.seminar_messages WHERE cohort_id='{LEGACY}'") == '2'
    checks.append('Closed Circles lose the meeting link and remain readable. Other hosts’ meetings, readers’ replies and their RSVPs remain available.')

    archive_http = subprocess.run([
        '/opt/homebrew/bin/node', '--require', './scripts/deny-build-network.cjs',
        './tests/support/circle-departure-http.mjs', str(kit['BIN'] / 'psql'), str(staged.socket),
        kit['PORT'], database, owner, reader, hosted,
    ], cwd=ROOT / 'verification/web', env=kit['ENV'], check=True, capture_output=True, text=True, timeout=15)
    report['archiveHttp'] = json.loads(archive_http.stdout)
    checks.append('The real Circle detail handler returns a private, readable archive with no meeting link from the restored database.')

    archive = temp / 'circle-departure.dump'
    staged.dump(database, archive)
    restored = 'soe_circle_departure_restored'
    original.restore(restored, archive)

    def from_restore(sql, role='postgres'):
        return original.query(restored, f'SET ROLE {role}; {sql}', owner)

    assert from_restore(f"SELECT {SCHEMA}.erase_circle_departure({reviewed},'{json.dumps(scope)}',true)") == finished
    assert from_restore(f"SELECT id FROM public.soe_account_deletion_status('{REQUEST}','{DIGEST}')", 'service_role') == REQUEST
    for name, previous_scope in previous_scopes.items():
        approval = '' if name == 'private_data' else ',true'
        from_restore(f"SELECT {SCHEMA}.erase_{name}({reviewed},'{previous_scope}'{approval})")
    restored_detail = json.loads(from_restore(f"SELECT public.soe_circle_detail('{reader}','{hosted}')", 'service_role'))
    assert restored_detail == closed
    checks.append('A second restore preserves the readable archive, the pending member receipt and the exact owner retry.')


def main():
    os.umask(0o077)
    contact = runpy.run_path(str(SCRIPT.with_name('rehearse-contact-erasure.py')))
    drafts = [*contact['DRAFTS'], ROOT / 'docs/sql/account-erasure-circle-relationships-apply.sql']
    release = runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL','CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    report = {'checks': [], 'productionRestoreVerified': False}
    with TemporaryDirectory(prefix='soe-circle-departure-', dir='/private/tmp') as directory:
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
            exercise(staged, original, database, owner, temp, release, harness, kit, drafts, report)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    report.update(status='PASS', clustersStopped=True, temporaryDirectoryRemoved=True, draftSha256=kit['digest'](drafts[-1]))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
