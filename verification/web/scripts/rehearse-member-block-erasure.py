"""Exercise the member block erasure draft and restore on disposable PostgreSQL 17."""
import json
from pathlib import Path
import runpy
import subprocess
import time

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT / 'docs/sql/account-erasure-member-blocks-apply.sql'
SCHEMA = 'soe_account_deletion_private'
BLOCKS = 'soe_member_safety_private.member_blocks'
RECEIPTS = SCHEMA + '.member_block_erasure_receipts'


def key(number):
    return f'fb000000-0000-4000-8000-{number:012d}'


def exercise(original, staged, database, temp, release, harness, kit, checker, report):
    owner = kit['OWNER']
    alice, bob, host, other, provider_only = (key(number) for number in range(101, 106))
    alice_request, bob_request, provider_request = (key(number) for number in range(201, 204))
    alice_binding, bob_binding = (alice_request, alice, None), (bob_request, bob, None)
    provider_binding = (provider_request, None, provider_only)
    session = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))
    waddle = runpy.run_path(str(SCRIPT.with_name('rehearse-waddle-erasure.py')))
    checks = report['memberBlockErasureChecks'] = []
    report['memberBlockErasureDraftSha256'] = kit['digest'](DRAFT)

    def query(sql, *, role='postgres', code=None, cluster=staged, db=database):
        return cluster.query(db, f'SET ROLE {role};\n' + sql, owner, sqlstate=code)

    def call(function, *args):
        return f"SELECT {function}({','.join(map(release['literal'], args))})"

    def owner_call(name, binding, *args, **options):
        return query(call(f'{SCHEMA}.{name}', *binding, *args), **options)

    def rpc(name, *args, code=None, **options):
        result = query(call(f'public.soe_{name}', *args), role='service_role', code=code, **options)
        return json.loads(result) if code is None else None

    def apply(code=None):
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', DRAFT, sqlstate=code)

    block_signature = 'public.soe_direct_message_set_block(uuid,uuid,uuid,boolean,bigint,uuid)'
    query(f'GRANT EXECUTE ON FUNCTION {block_signature} TO authenticated')
    apply('PT409')
    assert query(f"SELECT to_regclass('{RECEIPTS}') IS NULL") == 't'
    query(f'REVOKE EXECUTE ON FUNCTION {block_signature} FROM authenticated')
    apply()
    report['orderedMigrationFiles'].append(str(DRAFT.relative_to(ROOT)))
    checks.append('A drifted browser grant refuses installation atomically. The complete reviewed predecessor accepts the draft.')

    for number, member in enumerate((alice, bob, host, other), start=101):
        query(f"INSERT INTO public.members(id,display_name,wallet_address) VALUES "
              f"('{member}','Synthetic block erasure member','0x{number:040x}')")
    query(f"INSERT INTO auth.users VALUES ('{provider_only}','provider-block-erasure@fixture.invalid','synthetic')")
    day, weekday = query('SELECT CURRENT_DATE+1,extract(dow FROM CURRENT_DATE+1)::integer').split('|')
    circle = rpc('circle_create', host, key(1), {
        'title': 'Synthetic salon with a block erasure request', 'description': None, 'format': 'online',
        'city': None, 'region': None, 'venueName': None, 'venueType': 'online', 'weekday': int(weekday),
        'time': '19:00', 'timezone': 'UTC', 'startDate': day, 'maxMembers': 8, 'onlineUrl': release['MEETING'],
    })['circleId']
    for number, member in enumerate((alice, bob), start=2):
        revision = int(query(f"SELECT circle_participation_revision FROM public.book_cohorts WHERE id='{circle}'"))
        rpc('circle_join', member, circle, revision, key(number))
    post = rpc('circle_discussion_post', alice, circle, key(4), 'Synthetic departing member post.',
               None, None, None, 'Departing member')['message']['id']
    post_review = rpc('circle_message_state_profiles', host, circle, post)
    assert post_review['blockReview']['revision'] == 0
    rpc('direct_message_send', bob, alice, 'Synthetic private message hidden by the block.')
    bob_block = rpc('direct_message_set_block', bob, alice, None, True, 0, key(10))
    inactive = rpc('direct_message_set_block', alice, host, None, True, 0, key(11))
    rpc('direct_message_set_block', alice, None, inactive['blockId'], False, 1, key(12))
    unrelated_block = rpc('direct_message_set_block', other, host, None, True, 0, key(13))
    unrelated_row = f"SELECT to_jsonb(b) FROM {BLOCKS} b WHERE block_id='{unrelated_block['blockId']}'"
    unrelated_before = query(unrelated_row)

    for request, member, auth in (alice_binding, bob_binding, provider_binding):
        provider = 'supabase' if auth else 'wallet'
        req = f'SELECT id FROM public.soe_account_deletion_request({release["literal"](provider)},'
        req += f"'{auth or member}','{request}','{'8'*64}',4)"
        assert query(req, role='service_role') == request
    status_sql = f"SELECT to_jsonb(r) FROM public.soe_account_deletion_status('{alice_request}','{'8'*64}') AS r"
    status_before = query(status_sql, role='service_role')
    assert json.loads(status_before)['id'] == alice_request

    psql = [str(kit['BIN'] / 'psql'), *map(str, staged.psql(database))]

    def race(held_sql, competing_sql, code=None):
        name = 'soe_member_block_erasure_contender'
        with subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, env=kit['ENV']) as holder:
            try:
                session['send'](holder, 'BEGIN; ' + held_sql + ';')
                held_result = session['read_ready'](holder)
                with subprocess.Popen([*psql, '-c', competing_sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True, env={**kit['ENV'], 'PGAPPNAME': name}) as contender:
                    try:
                        deadline = time.monotonic() + 2
                        while query(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{name}' "
                                    "AND datname=current_database() AND wait_event_type='Lock')") != 't':
                            assert contender.poll() is None and time.monotonic() < deadline, 'Expected a database lock wait'
                            time.sleep(.03)
                        session['send'](holder, 'COMMIT;\n\\q')
                        _, error = holder.communicate(timeout=5)
                        assert holder.returncode == 0, error
                        result, error = contender.communicate(timeout=5)
                        if code is None:
                            assert contender.returncode == 0 and result.strip(), error
                        else:
                            assert contender.returncode != 0 and f'ERROR:  {code}:' in error, error
                    finally:
                        session['terminate'](contender)
            finally:
                session['terminate'](holder)
        return held_result

    alice_change = (alice, bob, None, True, 0, key(14))
    started_alice = call(f'{SCHEMA}.start_erasure', *alice_binding)
    alice_block = json.loads(race('SET ROLE service_role; ' + call('public.soe_direct_message_set_block', *alice_change),
                                 'SET ROLE postgres; ' + started_alice))
    assert alice_block['blockedByMe'] is True and alice_block['revision'] == 1
    alice_review = json.loads(owner_call('preview_member_block_erasure', alice_binding))
    alice_scope = alice_review['reviewedScope']
    assert alice_review['phase'] == 'review' and set(alice_scope) == {'version', 'outbound', 'inbound', 'active', 'sha256'}
    assert {name: alice_scope[name] for name in ('version', 'outbound', 'inbound', 'active')} == {
        'version': 1, 'outbound': 2, 'inbound': 1, 'active': 2,
    }
    assert len(alice_scope['sha256']) == 64 and all(c in '0123456789abcdef' for c in alice_scope['sha256'])
    assert alice_review == json.loads(query("SET TIME ZONE 'America/New_York'; " +
                                            call(f'{SCHEMA}.preview_member_block_erasure', *alice_binding)))
    checks.append('Erasure start waited for the admitted block. Review includes that write and inactive rows with a timezone-independent digest and no peer identifiers.')

    rpc('direct_message_set_block', *alice_change, code='PT403')
    rpc('direct_message_set_block', alice, other, None, True, 0, key(15), code='PT403')
    rpc('direct_message_set_block', bob, None, bob_block['blockId'], False, 1, key(16), code='PT403')
    rpc('circle_message_block', host, circle, post, post_review['revision'], post_review['contentHash'], 2, key(17), code='PT403')
    query(f"UPDATE {BLOCKS} SET revision=revision+1 WHERE actor_id='{bob}' AND peer_id='{alice}'", code='PT403')
    query(f"INSERT INTO {BLOCKS}(actor_id,peer_id,blocked,revision,last_request_id) VALUES "
          f"('{host}','{alice}',true,1,'{key(18)}')", code='PT403')
    owner_call('erase_member_blocks', alice_binding, alice_scope, True, code='PT409')
    assert rpc('direct_message_read', bob, alice)['messages'] == []
    rpc('circle_message_state_profiles', bob, circle, post, code='PT404')
    assert json.loads(owner_call('preview_member_block_erasure', alice_binding)) == alice_review
    checks.append('Fresh blocks, unblocks, exact replay and direct table writes involving a frozen account are refused. Blocks keep older posts and messages hidden while those phases are pending.')

    race('SET ROLE postgres; ' + call(f'{SCHEMA}.start_erasure', *bob_binding),
         'SET ROLE service_role; ' + call('public.soe_direct_message_set_block', host, bob, None, True, 0, key(19)),
         code='PT403')
    bob_scope = json.loads(owner_call('preview_member_block_erasure', bob_binding))['reviewedScope']
    assert (bob_scope['outbound'], bob_scope['inbound'], bob_scope['active']) == (1, 1, 2)
    checks.append('A block on a different pair waited behind erasure start, then saw the frozen peer and failed.')

    for role in ('anon', 'authenticated', 'service_role'):
        for name, args in [('preview_member_block_erasure', ()), ('erase_member_blocks', (alice_scope, True))]:
            owner_call(name, alice_binding, *args, role=role, code='42501')
        query(f'SELECT * FROM {RECEIPTS}', role=role, code='42501')
        query(f'SELECT * FROM {BLOCKS}', role=role, code='42501')
    owner_call('preview_member_block_erasure', (alice_request, bob, None), code='PT409')
    owner_call('erase_member_blocks', (alice_request, alice, provider_only), alice_scope, True, code='PT409')
    checks.append('Browser and service roles cannot inspect or erase private rows. Owners must supply the exact processing account and provider binding.')

    def complete_earlier_phases(binding):
        for phase in ('private_data', 'circle_posts', 'contact_data', 'circle_departure'):
            scope = json.loads(owner_call('preview_' + phase, binding))
            approval = () if phase == 'private_data' else (True,)
            owner_call('erase_' + phase, binding, scope, *approval)
        twiddle = json.loads(owner_call('preview_twiddle_erasure', binding))
        owner_call('erase_twiddle_data', binding, twiddle, True)
        origin = waddle['ORIGIN']
        voice = json.loads(owner_call('preview_waddle_erasure', binding, origin))
        assert voice['keys'] == []
        owner_call('prepare_waddle_erasure', binding, origin, voice['scopeDigest'], True)
        args = ','.join(map(release['literal'], (*binding, voice['scopeDigest'])))
        query(f'SELECT {SCHEMA}.clear_waddle_erasure({args}, ARRAY[]::text[])')

    for binding in (alice_binding, bob_binding):
        complete_earlier_phases(binding)
        owner_call('preview_identity_removal', binding, code='PT409')
    owner_call('erase_member_blocks', alice_binding, alice_scope, False, code='PT409')
    owner_call('erase_member_blocks', alice_binding, {**alice_scope, 'sha256': '0' * 64}, True, code='PT409')
    erase_alice = call(f'{SCHEMA}.erase_member_blocks', *alice_binding, alice_scope, True)
    query(f'ALTER TABLE {RECEIPTS} ADD CONSTRAINT reject_fixture_receipt CHECK (false) NOT VALID')
    query(erase_alice, code='23514')
    query(f'ALTER TABLE {RECEIPTS} DROP CONSTRAINT reject_fixture_receipt')
    assert json.loads(owner_call('preview_member_block_erasure', alice_binding)) == alice_review
    assert query(f"SELECT count(*) FROM {RECEIPTS} WHERE request_id='{alice_request}'") == '0'
    checks.append('Identity removal waits for the block phase. Unapproved or altered scope fails, and a failure writing the final receipt rolls back removal of every reviewed block.')

    erase_bob = call(f'{SCHEMA}.erase_member_blocks', *bob_binding, bob_scope, True)
    erased_at = race('SET ROLE postgres; ' + erase_alice, 'SET ROLE postgres; ' + erase_bob, code='PT409')
    assert query(erase_alice) == erased_at
    bob_empty = json.loads(owner_call('preview_member_block_erasure', bob_binding))['reviewedScope']
    assert (bob_empty['outbound'], bob_empty['inbound'], bob_empty['active']) == (0, 0, 0)
    owner_call('erase_member_blocks', bob_binding, bob_empty, True)
    assert query(unrelated_row) == unrelated_before
    rpc('direct_message_send', host, alice, 'Synthetic send after block erasure.', code='PT403')
    assert rpc('direct_message_read', bob, alice)['messages'] == []
    assert query(f"SELECT content FROM public.seminar_messages WHERE id='{post}'") == 'Removed with account deletion.'
    checks.append('Overlapping erasures serialize and the second owner must review again. The first retry reuses its time, the unrelated block stays intact, and the frozen member cannot receive new messages.')

    verified = None
    for binding in (alice_binding, bob_binding):
        identity = json.loads(owner_call('preview_identity_removal', binding))
        assert identity['phase'] == 'review' and identity['hasWallet'] and not identity['hasProvider']
        owner_call('prepare_identity_removal', binding, identity, True)
        result = owner_call('verify_identity_removal', binding)
        if binding == alice_binding:
            verified = result
    assert verified and owner_call('verify_identity_removal', alice_binding) == verified
    assert query(status_sql, role='service_role') == status_before
    owner_call('start_erasure', provider_binding)
    complete_earlier_phases(provider_binding)
    owner_call('preview_member_block_erasure', provider_binding, code='PT409')
    provider_identity = json.loads(owner_call('preview_identity_removal', provider_binding))
    assert provider_identity['phase'] == 'review' and provider_identity['hasProvider'] and not provider_identity['hasMember']
    owner_call('prepare_identity_removal', provider_binding, provider_identity, True)
    checks.append('Wallet-only identity removal verifies after the block receipts. A provider-only account can prepare identity removal without a block receipt. The public status receipt stays pending.')

    archive = temp / 'member-block-erasure.dump'
    partial = temp / 'member-block-erasure-omitted.dump'
    reference = temp / 'member-block-erasure-reference.json'
    previous = temp / 'member-block-erasure-previous.json'
    restored, omitted = 'soe_member_block_erasure_restore', 'soe_member_block_erasure_omitted'
    with harness['export_snapshot'](staged, kit, database=database) as snapshot:
        capture = (*staged.psql(database), '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                   '-f', harness['REFERENCE'], '-c', 'ROLLBACK;')
        for target, setting in [(reference, 'member_block_erasure'), (previous, 'circle_member_blocks')]:
            target.write_text(kit['run']('psql', '-v', f'soe_restore_include_{setting}=on', *capture) + '\n')
        dump = (*staged.connection(), '--format=custom', '--snapshot', snapshot, '-d', database)
        kit['run']('pg_dump', *dump, '--file', archive)
        kit['run']('pg_dump', *dump, '--file', partial, '--exclude-table-data=' + RECEIPTS)
    assert len(checker['decode_reference'](reference.read_bytes(), checker['MEMBER_BLOCK_ERASURE_FORMAT'])['tables']) == 67
    original.restore(restored, archive)
    original.restore(omitted, partial)
    match = harness['verify'](reference, original, kit, database=restored, include_member_block_erasure=True)
    mismatch = harness['verify'](reference, original, kit, database=omitted, include_member_block_erasure=True)
    old_match = harness['verify'](previous, original, kit, database=omitted, include_circle_member_blocks=True)
    assert match['status'] == 'MATCH' and match['tablesCompared'] == 67, match
    assert mismatch['status'] == 'MISMATCH' and mismatch['rowsDiffer'] == [RECEIPTS], mismatch
    assert old_match['status'] == 'MATCH' and old_match['tablesCompared'] == 66, old_match
    target = {'cluster': original, 'db': restored}
    assert query(erase_alice, **target) == erased_at
    assert owner_call('verify_identity_removal', alice_binding, **target) == verified
    assert query(unrelated_row, **target) == unrelated_before
    rpc('direct_message_set_block', host, alice, None, True, 0, key(20), code='PT403', **target)
    owner_call('verify_identity_removal', alice_binding, code='PT409', cluster=original, db=omitted)
    report['memberBlockErasureRestore'] = {'complete': match, 'receiptRowsOmitted': mismatch, 'earlierScope': old_match}
    checks.append('The 67-table reference catches a restore missing the receipts. The full restore preserves exact retry, frozen blocks and the unrelated row.')


def complete_chain(*args):
    runpy.run_path(str(SCRIPT.with_name('rehearse-circle-member-blocks.py')))['exercise'](*args)
    exercise(*args)


if __name__ == '__main__':
    runpy.run_path(str(SCRIPT.with_name('rehearse-direct-message-blocks.py')))['main'](complete_chain)
