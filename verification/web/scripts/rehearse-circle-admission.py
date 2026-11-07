"""Verify admission recovery on the complete disposable PostgreSQL release chain.

Uses already-installed tools, synthetic accounts, socket-only clusters and retained
scratch data. Never connects to hosted data, installs tools or reads credentials.
"""
from contextlib import redirect_stdout
from hashlib import sha256
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import mkdtemp
import time

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
SCHEMA = 'soe_circle_admission_private'


def key(number):
    return f'c9000000-0000-4000-8000-{number:012d}'


def exercise(original, staged, database, temp, release, harness, kit, checker, report):
    checks = report['admissionChecks'] = []
    owner = kit['OWNER']
    host, reader, other, pending = (key(n) for n in (1, 2, 3, 4))
    session = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))

    def query(sql, *, role='postgres', code=None, cluster=staged, db=database):
        return cluster.query(db, f'SET ROLE {role};\n' + sql, owner, sqlstate=code)

    def call(name, *args):
        return f"SELECT {name}({','.join(map(release['literal'], args))})"

    def rpc(name, *args, code=None, **options):
        result = query(call('public.soe_circle_' + name, *args), role='service_role', code=code, **options)
        return json.loads(result) if code is None else None

    for name in ('circle-legacy-salon-membership.sql', 'circle-admission-apply.sql'):
        path = ROOT / 'docs/sql' / name
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', path)
        report['orderedMigrationFiles'].append(str(path.relative_to(ROOT)))
    checks.append('The admission scripts install after the complete release, account-erasure, blocks and current reading-catalog chain.')
    for member in (host, reader, other, pending):
        query(f"INSERT INTO public.members(id,display_name,wallet_address) VALUES "
              f"('{member}','Synthetic admission member','0x{int(member[-12:]):040x}')")
    day, weekday = query('SELECT CURRENT_DATE+1,extract(dow FROM CURRENT_DATE+1)::integer').split('|')
    payload = {'title': 'Synthetic host-approved restore salon', 'description': None, 'format': 'online',
               'city': None, 'region': None, 'venueName': None, 'venueType': 'online', 'weekday': int(weekday),
               'time': '19:00', 'timezone': 'UTC', 'startDate': day, 'maxMembers': 8,
               'onlineUrl': release['MEETING'], 'admissionMode': 'host_approval'}
    circle = rpc('create', host, key(10), payload)['circleId']

    def revision(**options):
        return int(query(f"SELECT circle_participation_revision FROM public.book_cohorts WHERE id='{circle}'", **options))

    approval = rpc('invitation_review', host, circle, reader)
    expires = query("SELECT clock_timestamp()+interval '1 hour'")
    proof = sha256(b'synthetic-server-verified-token').hexdigest()
    join_args = (reader, circle, revision(), key(11), host, approval['invitationRevision'], key(12), proof, expires)
    rpc('join', reader, circle, revision(), key(13), code='PT403')
    query(f"INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES ('{circle}','{other}')",
          role='service_role', code='42501')
    joined = rpc('join_invited', *join_args)
    assert joined['replayed'] is False
    assert rpc('join_invited', *join_args) == {**joined, 'replayed': True}
    assert rpc('detail_profiles', reader, circle)['circle']['id'] == circle
    checks.append('Host approval is required, raw server inserts remain denied, and exact invited retry returns the original committed receipt.')

    archive, reference = temp / 'admission.dump', temp / 'admission-reference.json'
    with harness['export_snapshot'](staged, kit, database=database) as snapshot:
        reference.write_text(kit['run']('psql', '-v', 'soe_restore_include_circle_admission=on', *staged.psql(database),
                                       '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                                       '-f', harness['REFERENCE'], '-c', 'ROLLBACK;') + '\n')
        kit['run']('pg_dump', *staged.connection(), '--format=custom', '--snapshot', snapshot,
                   '-d', database, '--file', archive)
    value = checker['decode_reference'](reference.read_bytes(), checker['CIRCLE_ADMISSION_FORMAT'])
    assert len(value['tables']) == 67
    partial = temp / 'admission-receipt-omitted.dump'
    kit['run']('pg_dump', *staged.connection(), '--format=custom', '-d', database, '--file', partial,
               '--exclude-table-data=public.circle_participation_receipts')
    original.restore('soe_admission_receipt_omitted', partial)
    for name in ('soe_admission_restored', 'soe_admission_drifted'):
        original.restore(name, archive)
    target = {'cluster': original, 'db': 'soe_admission_restored'}
    drifted = {'cluster': original, 'db': 'soe_admission_drifted'}

    def verify(db='soe_admission_restored', **options):
        return harness['verify'](reference, original, kit, database=db, include_circle_admission=True, **options)

    match = verify()
    assert match['status'] == 'MATCH' and match['tablesCompared'] == 67, match
    assert match['circleAdmissionRoutinesMatch']
    assert rpc('join_invited', *join_args, **target) == {**joined, 'replayed': True}
    assert rpc('detail_profiles', reader, circle, **target)['circle']['id'] == circle
    report['admissionRestore'] = {'complete': match, 'referenceBytes': reference.stat().st_size,
                                  'archiveSha256': kit['digest'](archive)}
    omitted = verify(db='soe_admission_receipt_omitted')
    assert omitted['status'] == 'MISMATCH' and omitted['rowsDiffer'] == ['circle_participation_receipts'], omitted
    report['admissionRestore']['missingRecipientReceipts'] = omitted
    checks.append('A repeatable-read snapshot and its dump restore all 67 tables, private implementations, schema authority and the exact invitation receipt into another socket-only cluster.')

    missing = []
    signatures = query(f"SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                       f"WHERE n.nspname='{SCHEMA}' ORDER BY p.proname", **drifted).splitlines()
    assert len(signatures) == 8
    for signature in signatures:
        name = signature.split('.', 1)[1].split('(', 1)[0]
        query(f'ALTER FUNCTION {signature} RENAME TO missing_admission_helper', **drifted)
        refused = verify(db=drifted['db'])
        assert refused['status'] == 'UNAVAILABLE' and refused['check'] == 'local_snapshot_unavailable', refused
        query(f'ALTER FUNCTION {SCHEMA}.missing_admission_helper{signature[signature.index("("):]} RENAME TO {name}', **drifted)
        missing.append(name)
    report['admissionRestore']['missingHelpersRejected'] = missing
    checks.append('Removing any of the eight required private helpers refuses the comparison; an incomplete source cannot be captured as a matching baseline.')
    legacy = harness['verify'](reference, original, kit, database='soe_admission_restored', include_member_block_erasure=True)
    assert legacy['status'] == 'UNAVAILABLE', legacy
    # Exercise the SQL guard itself: the v18 reference would also fail old JSON decoding.
    refused = subprocess.run([str(kit['BIN'] / 'psql'), *map(str, original.psql(target['db'])),
                              '-v', 'soe_restore_include_member_block_erasure=on', '-c', checker['BEGIN'],
                              '-f', str(harness['REFERENCE']), '-c', 'ROLLBACK;'], env=kit['ENV'],
                             capture_output=True, text=True, timeout=15)
    assert refused.returncode != 0 and 'Use the complete circle-admission restore scope' in refused.stderr
    report['admissionRestore']['oldScopeRejected'] = True

    def changed(sql, undo, field):
        query(sql, **drifted)
        result = verify(db=drifted['db'])
        assert result['status'] == 'MISMATCH' and result[field] is False, result
        query(undo, **drifted)
        assert verify(db=drifted['db']) == match
        return result

    enabled = SCHEMA + '.enabled()'
    definition = query(f"SELECT pg_get_functiondef('{enabled}'::regprocedure)", **drifted)
    report['admissionRestore']['changedHelper'] = changed(
        f'CREATE OR REPLACE FUNCTION {enabled} RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT false $$',
        definition, 'circleAdmissionRoutinesMatch')
    report['admissionRestore']['helperGrant'] = changed(
        f'GRANT EXECUTE ON FUNCTION {enabled} TO authenticated',
        f'REVOKE EXECUTE ON FUNCTION {enabled} FROM authenticated', 'circleAdmissionRoutinesMatch')
    report['admissionRestore']['schemaGrant'] = changed(
        f'GRANT USAGE ON SCHEMA {SCHEMA} TO authenticated',
        f'REVOKE USAGE ON SCHEMA {SCHEMA} FROM authenticated', 'roleAndSchemaAccessMatch')
    query('GRANT UPDATE(circle_admission_mode) ON public.book_cohorts TO service_role', **drifted)
    column = verify(db=drifted['db'])
    assert column['status'] == 'MISMATCH' and 'book_cohorts' in column['definitionsDiffer'], column
    query('REVOKE UPDATE(circle_admission_mode) ON public.book_cohorts FROM service_role', **drifted)
    assert verify(db=drifted['db']) == match
    query(f"UPDATE public.book_cohorts SET circle_admission_mode='open' WHERE id='{circle}'", **drifted)
    mode = verify(db=drifted['db'])
    assert mode['status'] == 'MISMATCH' and mode['rowsDiffer'] == ['book_cohorts'], mode
    query(f"UPDATE public.book_cohorts SET circle_admission_mode='host_approval' WHERE id='{circle}'", **drifted)
    assert verify(db=drifted['db']) == match
    report['admissionRestore'].update(columnGrant=column, changedMode=mode)
    checks.append('The comparison rejects altered helper bodies, helper/schema grants, column update authority and approval-mode data, then matches again after each synthetic repair.')

    (temp / 'admission-progress.json').write_text(json.dumps(report, indent=2) + '\n')

    # Independent PostgreSQL backends, not in-memory sequential emulation.
    args = [str(kit['BIN'] / 'psql'), *map(str, original.psql(target['db']))]
    late_approval = rpc('invitation_review', host, circle, other, **target)
    rev = revision(**target)
    late_join = call('public.soe_circle_join_invited', other, circle, rev, key(21), host,
                     late_approval['invitationRevision'], key(22), 'b' * 64, expires)
    revoke = call('public.soe_circle_invitation_revoke', host, circle, rev, late_approval['invitationRevision'], key(23))
    with subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, env=kit['ENV']) as holder:
        try:
            session['send'](holder, 'SET ROLE service_role; BEGIN; ' + revoke + ';')
            revoked = json.loads(session['read_ready'](holder))
            with subprocess.Popen([*args, '-c', 'SET ROLE service_role; ' + late_join], stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True,
                                  env={**kit['ENV'], 'PGAPPNAME': 'soe_admission_contender'}) as contender:
                try:
                    deadline = time.monotonic() + 3
                    while query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='soe_admission_contender' "
                                "AND wait_event_type='Lock')", **target) != 't':
                        assert contender.poll() is None and time.monotonic() < deadline
                        time.sleep(0.03)
                    session['send'](holder, 'COMMIT;\n\\q')
                    _, error = holder.communicate(timeout=5)
                    assert holder.returncode == 0, error
                    _, error = contender.communicate(timeout=5)
                    assert contender.returncode != 0 and 'ERROR:  PT409:' in error, error
                finally:
                    session['terminate'](contender)
        finally:
            session['terminate'](holder)
    assert query(f"SELECT count(*) FROM public.book_cohort_members WHERE cohort_id='{circle}' AND member_id='{other}'", **target) == '0'
    assert rpc('detail_profiles', reader, circle, **target)['circle']['id'] == circle
    report['admissionRace'] = {'revokeHeldFirst': 'join waited and refused', 'existingMemberPreserved': True}
    checks.append('A second real PostgreSQL backend waits behind an uncommitted revocation, then refuses the stale join without admitting or evicting a member.')

    # Admission receipts must remain removable through the complete owner workflow.
    # Serialize admission with a real, uncommitted owner account-removal start.
    removal_request = key(40)
    removal_binding = (removal_request, pending, None)
    assert query(call('public.soe_account_deletion_request', 'wallet', pending, removal_request, '8'*64, 4).replace('SELECT ', 'SELECT id FROM ', 1),
                 role='service_role', **target) == removal_request
    pending_approval = rpc('invitation_review', host, circle, pending, **target)
    pending_join = call('public.soe_circle_join_invited', pending, circle, revision(**target), key(41), host,
                        pending_approval['invitationRevision'], key(42), 'c'*64, expires)
    with subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, env=kit['ENV']) as holder:
        try:
            session['send'](holder, 'SET ROLE postgres; BEGIN; ' + call('soe_account_deletion_private.start_erasure', *removal_binding) + ';')
            assert session['read_ready'](holder)
            with subprocess.Popen([*args, '-c', 'SET ROLE service_role; ' + pending_join], stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True,
                                  env={**kit['ENV'], 'PGAPPNAME': 'soe_admission_removal_contender'}) as contender:
                try:
                    deadline = time.monotonic() + 3
                    while query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='soe_admission_removal_contender' "
                                "AND wait_event_type='Lock')", **target) != 't':
                        assert contender.poll() is None and time.monotonic() < deadline
                        time.sleep(0.03)
                    session['send'](holder, 'COMMIT;\n\\q')
                    _, error = holder.communicate(timeout=5)
                    assert holder.returncode == 0, error
                    _, error = contender.communicate(timeout=5)
                    assert contender.returncode != 0 and 'ERROR:  PT403:' in error, error
                finally:
                    session['terminate'](contender)
        finally:
            session['terminate'](holder)
    assert query(f"SELECT count(*) FROM public.book_cohort_members WHERE cohort_id='{circle}' AND member_id='{pending}'", **target) == '0'
    report['admissionRace']['accountRemovalHeldFirst'] = 'join waited and refused frozen recipient'
    checks.append('A separate backend also waits behind account-removal start, then refuses the frozen recipient without creating a membership.')

    request = key(30)
    binding = (request, reader, None)
    schema = 'soe_account_deletion_private'
    result = query(call('public.soe_account_deletion_request', 'wallet', reader, request, '9' * 64, 4).replace('SELECT ', 'SELECT id FROM ', 1),
                   role='service_role', **target)
    assert result == request
    query(call(schema + '.start_erasure', *binding), **target)
    rpc('join_invited', *join_args, code='PT403', **target)
    for phase in ('private_data', 'circle_posts', 'contact_data', 'circle_departure'):
        scope = json.loads(query(call(schema + '.preview_' + phase, *binding), **target))
        approve = () if phase == 'private_data' else (True,)
        query(call(schema + '.erase_' + phase, *binding, scope, *approve), **target)
    assert query(f"SELECT count(*) FROM public.circle_participation_receipts WHERE actor_member_id='{reader}'", **target) == '0'
    assert query(f"SELECT count(*) FROM public.book_cohort_members WHERE cohort_id='{circle}' AND member_id='{reader}'", **target) == '0'
    twiddle = json.loads(query(call(schema + '.preview_twiddle_erasure', *binding), **target))
    query(call(schema + '.erase_twiddle_data', *binding, twiddle, True), **target)
    waddle = runpy.run_path(str(SCRIPT.with_name('rehearse-waddle-erasure.py')))
    voice = json.loads(query(call(schema + '.preview_waddle_erasure', *binding, waddle['ORIGIN']), **target))
    assert voice['keys'] == []
    query(call(schema + '.prepare_waddle_erasure', *binding, waddle['ORIGIN'], voice['scopeDigest'], True), **target)
    values = ','.join(map(release['literal'], (*binding, voice['scopeDigest'])))
    query(f"SELECT {schema}.clear_waddle_erasure({values},ARRAY[]::text[])", **target)
    block_scope = json.loads(query(call(schema + '.preview_member_block_erasure', *binding), **target))['reviewedScope']
    query(call(schema + '.erase_member_blocks', *binding, block_scope, True), **target)
    identity = json.loads(query(call(schema + '.preview_identity_removal', *binding), **target))
    assert identity['hasWallet'] and not identity['hasProvider']
    query(call(schema + '.prepare_identity_removal', *binding, identity, True), **target)
    verified = query(call(schema + '.verify_identity_removal', *binding), **target)
    assert verified and query(call(schema + '.verify_identity_removal', *binding), **target) == verified
    assert query(f"SELECT supabase_auth_id IS NULL AND wallet_address IS NULL AND display_name='Former member' FROM public.members WHERE id='{reader}'", **target) == 't'
    report['admissionErasure'] = {'frozenReplayRefused': True, 'recipientReceiptsRemoved': True,
                                 'membershipRemoved': True, 'walletIdentityRemovalVerified': True}
    checks.append('The restored owner erasure workflow freezes the recipient, refuses a replay, and removes invitation receipts and membership and completes wallet identity removal through all reviewed phases.')


def complete_chain(*args):
    previous = runpy.run_path(str(SCRIPT.with_name('rehearse-good-samaritan-edition.py')))
    previous['complete_chain'](*args)
    (args[3] / 'before-admission-report.json').write_text(json.dumps(args[-1], indent=2) + '\n')
    exercise(*args)


def main():
    os.umask(0o077)
    temp = Path(mkdtemp(prefix='soe-circle-departure-', dir='/private/tmp'))
    output = io.StringIO()
    def source_hashes():
        inputs = {}
        for name in ('app', 'lib', 'docs/sql', 'verification/web/scripts', 'verification/web/tests', 'content/root-kernel'):
            for path in sorted((ROOT / name).rglob('*')):
                if path.is_symlink() or not path.is_file() or path.suffix not in ('.py', '.cjs', '.mjs', '.js', '.ts', '.tsx', '.sql', '.json'):
                    continue
                info = path.stat()
                assert not info.st_size or info.st_blocks, f'Nonresident rehearsal input: {path}'
                inputs[str(path.relative_to(ROOT))] = sha256(path.read_bytes()).hexdigest()
        return inputs

    before = source_hashes()
    started = time.monotonic()
    try:
        with redirect_stdout(output):
            runpy.run_path(str(SCRIPT.with_name('rehearse-direct-message-blocks.py')))['main'](
                complete_chain, rehearsal_directory=temp)
        report = json.loads(output.getvalue())
        assert source_hashes() == before, 'Rehearsal source changed'
        report.update(sourceSha256=before, sourceUnchanged=True)
        report.update(ownedRetainedDirectory=str(temp), elapsedSeconds=round(time.monotonic()-started, 2),
                      evidenceKind='synthetic local PostgreSQL 17.11; no hosted credentials or provider calls')
        (temp / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'status': report['status'], 'report': str(temp/'report.json'),
                          'clustersStopped': report['clustersStopped'], 'productionCleared': False}))
    except BaseException:
        (temp / 'failure-context.txt').write_text(output.getvalue())
        print(json.dumps({'status': 'FAIL', 'retainedDirectory': str(temp), 'productionCleared': False}), flush=True)
        raise


if __name__ == '__main__':
    main()
