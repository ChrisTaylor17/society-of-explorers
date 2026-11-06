"""Verify shared member blocks and recovery with isolated PostgreSQL 17 clusters."""
import json
from pathlib import Path
import runpy
import subprocess
import time

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT / 'docs/sql/circle-member-blocks-apply.sql'


def key(number):
    return f'fa000000-0000-4000-8000-{number:012d}'


def exercise(original, staged, database, temp, release, harness, kit, checker, report):
    owner = kit['OWNER']
    host, author, third, reviewer = (key(n) for n in range(101, 105))
    session = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))
    checks = report['circleMemberBlockChecks'] = []
    report['circleMemberBlockDraftSha256'] = kit['digest'](DRAFT)

    def query(sql, *, role='postgres', code=None, cluster=staged, db=database):
        return cluster.query(db, f'SET ROLE {role};\n' + sql, owner, sqlstate=code)

    def call(name, *args):
        return f"SELECT public.soe_{name}({','.join(map(release['literal'], args))})"

    def rpc(name, *args, code=None, **options):
        result = query(call(name, *args), role='service_role', code=code, **options)
        return json.loads(result) if code is None else None

    def circle_rpc(name, *args, **options):
        return rpc('circle_' + name, *args, **options)

    state_signature = 'public.soe_circle_message_state(uuid,uuid,uuid)'
    query(f'GRANT EXECUTE ON FUNCTION {state_signature} TO authenticated')
    kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', DRAFT, sqlstate='PT409')
    assert query("SELECT to_regprocedure('public.soe_circle_message_block(uuid,uuid,uuid,bigint,text,bigint,uuid)') IS NULL") == 't'
    query(f'REVOKE EXECUTE ON FUNCTION {state_signature} FROM authenticated')
    kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', DRAFT)
    report['orderedMigrationFiles'].append(str(DRAFT.relative_to(ROOT)))
    checks.append('A drifted browser grant stops the entire draft. The reviewed predecessor accepts it.')

    for actor in (host, author, third, reviewer):
        query(f"INSERT INTO public.members(id,display_name) VALUES ('{actor}','Synthetic Circle block member')")
    day, weekday = query("SELECT CURRENT_DATE+1,extract(dow FROM CURRENT_DATE+1)::integer").split('|')

    def create_circle(number, title):
        result = circle_rpc('create', host, key(number), {
            'title': title, 'description': None, 'format': 'online', 'city': None, 'region': None,
            'venueName': None, 'venueType': 'online', 'weekday': int(weekday), 'time': '19:00',
            'timezone': 'UTC', 'startDate': day, 'maxMembers': 8, 'onlineUrl': release['MEETING'],
        })
        return result['circleId']

    circle = create_circle(20, 'Synthetic first Circle for blocking')
    other_circle = create_circle(21, 'Synthetic second Circle for blocking')
    for actor, cohort, number in [(third, circle, 1), (author, other_circle, 2), (author, circle, 22)]:
        revision = int(query(f"SELECT circle_participation_revision FROM public.book_cohorts WHERE id='{cohort}'"))
        circle_rpc('join', actor, cohort, revision, key(number))
    query(f"INSERT INTO public.circle_reviewer_grants(cohort_id,member_id) VALUES ('{circle}','{reviewer}')")
    query(f"UPDATE public.members SET profile_visibility='public' WHERE id='{author}'")

    def root(actor, cohort, number, text, name):
        return circle_rpc('discussion_post', actor, cohort, key(number), text, None, None, None, name)['message']['id']

    author_text = 'Synthetic author post for block review.'
    host_text = 'Synthetic host contribution remains stored.'
    third_text = 'Synthetic third member reply is still visible.'
    post = root(author, circle, 3, author_text, 'Test author')
    other_post = root(author, circle, 4, 'Different reviewed post by the same author.', 'Test author')
    host_post = root(host, circle, 5, host_text, 'Test host')
    cross_post = root(author, other_circle, 6, 'A second Circle uses the same member block.', 'Test author')
    third_target = circle_rpc('discussion_target', third, circle, post)['target']
    reply = circle_rpc('discussion_post', third, circle, key(7), third_text, post,
                       third_target['revision'], third_target['contentHash'], 'Third member')['message']['id']
    checked = circle_rpc('message_state_profiles', host, circle, post)
    assert checked['message']['content'] == author_text and checked['message']['publicProfileId'] == author
    assert checked['blockReview'] == {'memberId': host, 'revision': 0}
    assert 'blockReview' not in circle_rpc('message_state_profiles', author, circle, post)
    circle_rpc('message_block', third, other_circle, cross_post, checked['revision'], checked['contentHash'], 0, key(8), code='PT403')
    circle_rpc('message_block', author, circle, post, checked['revision'], checked['contentHash'], 0, key(8), code='PT404')
    circle_rpc('message_block', host, circle, post, checked['revision'], 'a' * 64, 0, key(8), code='PT409')

    report_note = 'Private synthetic safety report.'
    report_args = (host, circle, post, checked['revision'], checked['contentHash'], key(9), 'report', 'safety', report_note)
    assert circle_rpc('message_action', *report_args)['received'] is True
    checked = circle_rpc('message_state_profiles', host, circle, post)
    block_args = (host, circle, post, checked['revision'], checked['contentHash'], 0, key(10))
    cross_target = circle_rpc('discussion_target', host, other_circle, cross_post)['target']
    stale_reply = (host, other_circle, key(11), 'Old reply to a newly blocked author.',
                   cross_post, cross_target['revision'], cross_target['contentHash'], 'Test host')
    assert rpc('direct_message_send', author, host, 'Preserved synthetic direct message.')['ok']

    # The contender reaches the exact pair lock in another Circle. The
    # committed block must be visible to the waiting reply before its insert.
    args = [str(kit['BIN'] / 'psql'), *map(str, staged.psql(database))]
    with subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, env=kit['ENV']) as holder:
        try:
            session['send'](holder, 'SET ROLE service_role; BEGIN; ' + call('circle_message_block', *block_args) + ';')
            receipt = json.loads(session['read_ready'](holder))
            assert receipt == {'requestId': key(10), 'blockId': receipt['blockId'], 'blockedByMe': True,
                               'revision': 1, 'circleId': circle, 'messageId': post}
            with subprocess.Popen([*args, '-c', 'SET ROLE service_role; ' + call('circle_discussion_post', *stale_reply)],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                  env={**kit['ENV'], 'PGAPPNAME': 'soe_circle_block_contender'}) as contender:
                try:
                    deadline = time.monotonic() + 2
                    while query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='soe_circle_block_contender' "
                                "AND wait_event_type='Lock' AND wait_event='advisory')") != 't':
                        assert contender.poll() is None and time.monotonic() < deadline
                        time.sleep(.03)
                    session['send'](holder, 'COMMIT;\n\\q')
                    _, error = holder.communicate(timeout=5)
                    assert holder.returncode == 0, error
                    _, error = contender.communicate(timeout=5)
                    assert contender.returncode != 0 and 'ERROR:  PT409:' in error, error
                finally:
                    session['terminate'](contender)
        finally:
            session['terminate'](holder)
    assert query(f"SELECT count(*) FROM public.circle_discussion_post_receipts WHERE request_id='{key(11)}'") == '0'
    checks.append('A separately connected reply in another Circle waited on the real pair lock and failed after the block committed.')

    assert circle_rpc('message_block', *block_args) == receipt
    circle_rpc('message_block', host, circle, other_post, checked['revision'], checked['contentHash'], 0, key(10), code='PT404')
    circle_rpc('message_state_profiles', host, circle, post, code='PT404')
    circle_rpc('message_state_profiles', author, circle, host_post, code='PT404')
    circle_rpc('discussion_target', host, other_circle, cross_post, code='PT409')
    circle_rpc('message_action', *report_args, code='PT404')
    current_review = circle_rpc('message_review_detail', reviewer, circle, post)
    assert current_review['message']['content'] == author_text and current_review['reports'][0]['note'] == report_note
    assert circle_rpc('message_state_profiles', author, circle, post)['message']['is_mine']
    checks.append('The two members cannot retrieve one another’s safety text. The author and assigned reviewer keep their separate access.')

    thread = circle_rpc('discussion_thread_profiles', host, circle, reply, None, 25)
    hidden = thread['root']
    assert hidden['id'] == post and hidden['visibility'] == 'unavailable' and hidden['content'] is None
    assert hidden['member_name'] == 'Explorer' and hidden['created_at'] is None and hidden['publicProfileId'] is None
    assert thread['focus']['content'] == third_text and thread['focus']['parentMessageId'] == post
    assert circle_rpc('discussion_thread_profiles', author, circle, host_post, None, 25)['focus']['content'] is None
    assert circle_rpc('discussion_thread_profiles', third, circle, post, None, 25)['focus']['content'] == author_text
    flat = circle_rpc('messages_read_profiles', host, circle)
    ids = {message['id'] for message in flat['messages']}
    assert post not in ids and other_post not in ids and {host_post, reply}.issubset(ids)
    assert rpc('direct_message_read', host, author)['messages'] == []
    assert rpc('direct_message_read', author, host)['messages'] == []
    assert any(item['blockId'] == receipt['blockId'] for item in rpc('direct_message_blocks', host, None)['items'])
    checks.append('The shared block hides both directions, preserves independent replies and appears in the owner’s block list.')

    for role in ('anon', 'authenticated', 'service_role'):
        query('SELECT * FROM soe_member_safety_private.member_blocks', role=role, code='42501')
        if role != 'service_role':
            query(call('circle_message_block', *block_args), role=role, code='42501')
    checks.append('Browser roles cannot execute the block routine and the app service role has no raw block-table access.')

    archive = temp / 'circle-member-blocks.dump'
    reference = temp / 'circle-member-blocks-reference.json'
    previous = temp / 'circle-member-blocks-previous-reference.json'
    restored = 'soe_circle_member_blocks_restored'
    with harness['export_snapshot'](staged, kit, database=database) as snapshot:
        capture = (*staged.psql(database), '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                   '-f', harness['REFERENCE'], '-c', 'ROLLBACK;')
        for target, setting in [(reference, 'circle_member_blocks'), (previous, 'member_safety')]:
            target.write_text(kit['run']('psql', '-v', f'soe_restore_include_{setting}=on', *capture) + '\n')
        kit['run']('pg_dump', *staged.connection(), '--format=custom', '--snapshot', snapshot, '-d', database,
                   '--file', archive)
    decoded = checker['decode_reference'](reference.read_bytes(), checker['CIRCLE_MEMBER_BLOCKS_FORMAT'])
    assert len(decoded['tables']) == 66
    original.restore(restored, archive)
    target = {'cluster': original, 'db': restored}
    match = harness['verify'](reference, original, kit, database=restored, include_circle_member_blocks=True)
    assert match['status'] == 'MATCH' and match['tablesCompared'] == 66, match
    assert circle_rpc('message_block', *block_args, **target) == receipt
    assert circle_rpc('discussion_thread_profiles', host, circle, reply, None, 25, **target) == thread
    query('DROP FUNCTION soe_member_safety_private.own_block_revision(uuid,uuid)', **target)
    old_match = harness['verify'](previous, original, kit, database=restored, include_member_safety=True)
    missing = harness['verify'](reference, original, kit, database=restored, include_circle_member_blocks=True)
    assert old_match['status'] == 'MATCH' and missing['status'] != 'MATCH', missing
    checks.append('A full restore preserves the block and reply tree. The new reference refuses a restore missing the private revision function.')

    rpc('direct_message_set_block', host, None, receipt['blockId'], False, 1, key(12))
    current = circle_rpc('message_state_profiles', host, circle, post)
    assert current['message']['content'] == author_text and current['blockReview']['revision'] == 2
    circle_rpc('message_block', *block_args, code='PT409')
    assert rpc('direct_message_read', host, author)['messages'][0]['content'] == 'Preserved synthetic direct message.'
    checks.append('An owner unblock restores current visibility and the old block request cannot reapply it.')
    report['circleMemberBlockRestore'] = {'complete': match, 'previousScopeMissingRoutine': old_match, 'missingRoutine': missing}


if __name__ == '__main__':
    runpy.run_path(str(SCRIPT.with_name('rehearse-direct-message-blocks.py')))['main'](exercise)
