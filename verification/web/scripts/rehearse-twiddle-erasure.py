"""Verify reviewed legacy Twiddle erasure and provider removal on a local restore."""
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
SCHEMA = 'soe_account_deletion_private'
CONTAINMENT = ROOT / 'docs/sql/legacy-twiddle-data-containment-apply.sql'
DRAFT = ROOT / 'docs/sql/account-erasure-twiddle-apply.sql'
FIXTURE = ROOT / 'verification/web/tests/fixtures/legacy-twiddle-synthetic.sql'
REMOVED = 'Removed with account deletion.'


def key(number):
    return f'76000000-0000-4000-8000-{number:012d}'


def twiddle_schema(resident):
    source = resident(FIXTURE).decode()
    first = 'CREATE TABLE public.twiddles ('
    last = 'GRANT SELECT (id) ON public.twiddles TO fixture_audit;'
    assert source.count(first) == source.count(last) == 1
    return source[source.index(first):source.index(last)]


def seed_twiddle(run, subject, other, resident):
    # Keep the identity fixture's provider setup and replace its Twiddle tables.
    run('DROP TABLE public.twiddle_collaborators,public.twiddle_reactions,public.twiddles RESTRICT')
    run(twiddle_schema(resident))
    run(f"""
      INSERT INTO public.twiddles(id,author_id,content,twiddle_type,thread_type,voice_url,
        artifact_url,sketch_data,thinker_tags,mintable,exp_awarded,created_at)
      VALUES ('{key(1)}','{subject}','Synthetic departing root','sketch','collaborative',
        'https://media.fixture.invalid/private-audio','https://media.fixture.invalid/private-artifact',
        '{{"text":"Synthetic sketch"}}','{{socrates}}',true,17,'2026-04-04T12:00:00Z');
      INSERT INTO public.twiddles(id,author_id,content,twiddle_type,thread_type,parent_id,root_id)
      VALUES ('{key(2)}','{other}','Another author reply','text','collaborative','{key(1)}','{key(1)}'),
        ('{key(3)}','{other}','Separate member root','text','open',NULL,NULL),
        ('{key(4)}','{subject}','Departing reply in another thread','text','open','{key(3)}',NULL),
        ('{key(5)}',NULL,'Synthetic reply from the old AI route','text','open','{key(3)}','{key(3)}'),
        ('{key(6)}','{other}','Synthetic woven copy','text','open',NULL,NULL),
        ('{key(7)}',NULL,'Historical entry with no recorded author','text','solo',NULL,NULL),
        ('{key(8)}','{other}','Other reply to a departing reply','text','open','{key(4)}','{key(3)}');
      UPDATE public.twiddles SET minted=true,nft_token_id=23 WHERE id='{key(4)}';
      UPDATE public.twiddles SET is_thinker_response=true,thinker_key='socrates' WHERE id='{key(5)}';
      UPDATE public.twiddles SET is_woven=true,woven_from=ARRAY['{key(1)}'::uuid] WHERE id='{key(6)}';
      INSERT INTO public.twiddle_collaborators(id,twiddle_id,user_id,contribution_type) VALUES
        ('{key(11)}','{key(3)}','{subject}','branch'),('{key(12)}','{key(1)}','{other}','branch'),
        ('{key(13)}','{key(3)}',NULL,'weave');
      INSERT INTO public.twiddle_reactions(id,twiddle_id,user_id,reaction_type) VALUES
        ('{key(21)}','{key(3)}','{subject}','question'),('{key(22)}','{key(1)}','{other}','illuminate'),
        ('{key(23)}','{key(3)}',NULL,'question');
    """)


def exercise(staged, original, database, owner, temp, release, harness, kit, previous, identity, drafts, report):
    host, reader = (release[name] for name in ('HOST','READER'))
    subject, other = (harness[name] for name in ('AUTH_SUBJECT','SECOND_AUTH_SUBJECT'))
    request, status_digest = previous['REQUEST'], previous['DIGEST']
    checks = report['checks']

    def run(sql, *, role='postgres', sqlstate=None):
        return staged.query(database, f'SET ROLE {role};\n' + sql, owner, sqlstate=sqlstate)

    def apply(file, *, sqlstate=None):
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', file, sqlstate=sqlstate)
        if sqlstate is None:
            report['orderedMigrationFiles'].append(str(file.relative_to(ROOT)))

    def exact(req, member, auth):
        return ','.join(release['literal'](value) for value in (req,member,auth))

    def statement(function, binding, *args):
        tail = ''.join(',' + release['literal'](value) for value in args)
        return f'SELECT {SCHEMA}.{function}({binding}{tail});'

    def call(function, binding, *args, **kwargs):
        return run(statement(function,binding,*args), **kwargs)

    def scope(binding):
        return json.loads(call('preview_twiddle_erasure',binding))

    def sdk(auth, mode):
        result = subprocess.run([
            '/opt/homebrew/bin/node','--require','./scripts/deny-build-network.cjs',
            './tests/support/identity-removal-auth.mjs',str(kit['BIN'] / 'psql'),str(staged.socket),
            kit['PORT'],database,owner,auth,mode,
        ], cwd=ROOT/'verification/web', env=kit['ENV'], capture_output=True, text=True, timeout=15)
        assert result.returncode == 0, result.stderr[-2800:]
        report['providerSdk'].append(json.loads(result.stdout))

    def read_rows(table, condition):
        return run(f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.{table} AS t WHERE {condition}")

    identity['install_provider_fixture'](run,subject,other,host)
    seed_twiddle(run,subject,other,harness['resident'])
    previous['exercise'](staged,original,database,owner,temp,release,harness,kit,drafts,report)
    apply(identity['DRAFT'])
    binding = exact(request,host,subject)
    public_receipt_sql = f"SELECT to_jsonb(r) FROM public.soe_account_deletion_status('{request}','{status_digest}') AS r"
    receipt = run(public_receipt_sql,role='service_role')
    run("DELETE FROM storage.objects WHERE id IN (1,2); DELETE FROM storage.buckets WHERE id='subject-owned-fixture'")
    identity_before = json.loads(call('preview_identity_removal',binding))
    assert identity_before['provider']['otherReferences'] == {
        'public.twiddles.author_id': 2, 'public.twiddle_collaborators.user_id': 1, 'public.twiddle_reactions.user_id': 1,
    }
    call('prepare_identity_removal',binding,identity_before,True,sqlstate='PT409')
    sdk(subject,'reference_blocks')
    checks.append('The actual Auth client hits the synthetic foreign-key refusal while the departing account still has Twiddle links.')

    apply(CONTAINMENT)
    assert run('SELECT count(*) FROM public.twiddles',role='service_role') == '8'
    run('CREATE TABLE public.fixture_unreviewed_link(id uuid REFERENCES public.twiddle_collaborators(id) ON DELETE CASCADE)')
    apply(DRAFT,sqlstate='PT409')
    assert run('SELECT count(*) FROM public.twiddles',role='service_role') == '8'
    assert run(f"SELECT to_regclass('{SCHEMA}.twiddle_erasure_receipts') IS NULL") == 't'
    run('DROP TABLE public.fixture_unreviewed_link')
    apply(DRAFT)
    assert len(report['orderedMigrationFiles']) == 57
    call('preview_identity_removal',binding,sqlstate='PT409')
    for role in ('anon','authenticated','service_role'):
        for table in ('twiddles','twiddle_collaborators','twiddle_reactions'):
            for sql in (f'SELECT id FROM public.{table}',f'UPDATE public.{table} SET id=id',
                        f'DELETE FROM public.{table}',f'INSERT INTO public.{table}(id) VALUES(gen_random_uuid())'):
                run(sql,role=role,sqlstate='42501')
                report['closedRoleOperations'] += 1
        call('preview_twiddle_erasure',binding,role=role,sqlstate='42501')
        call('erase_twiddle_data',binding,{},True,role=role,sqlstate='42501')
        run(f'SELECT * FROM {SCHEMA}.twiddle_erasure_receipts',role=role,sqlstate='42501')
    checks.append('Unreviewed dependencies roll back archive activation. Once closed, all three app roles lack table access and owner routines remain private.')

    blocked = scope(binding)
    assert blocked['counts'] == {'posts':2,'collaborators':1,'reactions':1}
    assert blocked['blockers'] == {'media':[key(1)],'minted':[key(4)],'copies':[key(5),key(6)]}
    assert len(blocked['snapshot']) == 64 and 'fixture.invalid' not in json.dumps(blocked)
    assert 'Synthetic departing root' not in json.dumps(blocked)
    call('erase_twiddle_data',binding,blocked,True,sqlstate='PT409')
    call('preview_twiddle_erasure',exact(request,reader,subject),sqlstate='PT409')
    checks.append('Review lists only counts, IDs and a digest. It refuses stored media, minted rows, a woven copy and an AI reply in the same parent-only legacy thread.')

    # Simulate separate dispositions solely on this fixture. Real media,
    # provider copies and on-chain material have their own approval workflow.
    run(f"""
      UPDATE public.twiddles SET voice_url=NULL,artifact_url=NULL WHERE id='{key(1)}';
      UPDATE public.twiddles SET minted=false,nft_token_id=NULL WHERE id='{key(4)}';
      UPDATE public.twiddles SET content='Synthetic copy reviewed',is_thinker_response=false,thinker_key=NULL,
        is_woven=false,woven_from=NULL WHERE id IN ('{key(5)}','{key(6)}');
    """)
    reviewed = scope(binding)
    assert reviewed['blockers'] == {'media':[],'minted':[],'copies':[]}
    call('erase_twiddle_data',binding,blocked,True,sqlstate='PT409')
    call('erase_twiddle_data',binding,reviewed,False,sqlstate='PT409')
    race = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))['race']
    race.__globals__['SOURCE'] = database
    race(staged, f"SET LOCAL ROLE postgres; UPDATE public.twiddles SET content='Fixture edit before review' "
                 f"WHERE id='{key(1)}' RETURNING id;",
         'SET ROLE postgres; ' + statement('erase_twiddle_data',binding,reviewed,True),'PT409')
    assert scope(binding)['snapshot'] != reviewed['snapshot']
    reviewed = scope(binding)
    run('BEGIN; GRANT SELECT(content) ON public.twiddles TO service_role; ' +
        statement('preview_twiddle_erasure',binding),sqlstate='PT409')
    run('BEGIN; ALTER TABLE public.twiddles DISABLE TRIGGER twiddles_updated; ' +
        statement('preview_twiddle_erasure',binding),sqlstate='PT409')
    checks.append('The exact review refuses stale approval after a concurrent owner write and detects grant or trigger drift.')

    unaffected = f"id NOT IN ('{key(1)}','{key(4)}')"
    other_posts = read_rows('twiddles',unaffected)
    other_collaborators = read_rows('twiddle_collaborators',f"user_id IS DISTINCT FROM '{subject}'")
    other_reactions = read_rows('twiddle_reactions',f"user_id IS DISTINCT FROM '{subject}'")
    run(f'ALTER TABLE {SCHEMA}.twiddle_erasure_receipts ADD CONSTRAINT fixture_failure CHECK(false)')
    call('erase_twiddle_data',binding,reviewed,True,sqlstate='23514')
    assert scope(binding) == reviewed
    assert run(f'SELECT count(*) FROM {SCHEMA}.twiddle_erasure_targets') == '0'
    run(f'ALTER TABLE {SCHEMA}.twiddle_erasure_receipts DROP CONSTRAINT fixture_failure')
    cleared = call('erase_twiddle_data',binding,reviewed,True)
    assert call('erase_twiddle_data',binding,reviewed,True) == cleared
    call('erase_twiddle_data',binding,reviewed,False,sqlstate='PT409')
    assert run(f"SELECT count(*) FROM public.twiddles WHERE id IN ('{key(1)}','{key(4)}')"
        f" AND content='{REMOVED}' AND author_id IS NULL AND twiddle_type='text' AND voice_url IS NULL"
        " AND artifact_url IS NULL AND sketch_data IS NULL AND thinker_tags IS NULL AND thinker_key IS NULL"
        " AND woven_from IS NULL AND mintable IS FALSE AND is_thinker_response IS FALSE AND is_woven IS FALSE") == '2'
    assert run(f"SELECT parent_id FROM public.twiddles WHERE id='{key(4)}'") == key(3)
    assert run(f"SELECT exp_awarded FROM public.twiddles WHERE id='{key(1)}'") == '17'
    assert read_rows('twiddles',unaffected) == other_posts
    assert read_rows('twiddle_collaborators','true') == other_collaborators
    assert read_rows('twiddle_reactions','true') == other_reactions
    checks.append('A late receipt failure rolls back every change. An exact retry preserves both thread anchors and every unrelated reply, collaborator and reaction.')

    run(f"BEGIN; UPDATE public.twiddles SET content='Changed placeholder' WHERE id='{key(1)}'; " +
        statement('preview_identity_removal',binding),sqlstate='PT409')
    run(f"BEGIN; UPDATE public.twiddles SET woven_from=ARRAY['{key(1)}'::uuid] WHERE id='{key(6)}'; " +
        statement('preview_identity_removal',binding),sqlstate='PT409')
    run(f"BEGIN; INSERT INTO public.twiddle_reactions(id,twiddle_id,user_id,reaction_type) VALUES"
        f"('{key(99)}','{key(3)}','{subject}','extend'); " +
        statement('preview_identity_removal',binding),sqlstate='PT409')
    ready = json.loads(call('preview_identity_removal',binding))
    assert ready['provider']['otherReferences'] == {}
    call('prepare_identity_removal',binding,ready,True)
    sdk(subject,'commit_without_reply')
    call('verify_identity_removal',binding,sqlstate='PT409')
    run(f"DELETE FROM auth.flow_state WHERE user_id='{subject}'",role='supabase_auth_admin')
    verified = call('verify_identity_removal',binding)
    assert run(f"SELECT display_name FROM public.members WHERE id='{host}'") == 'Former member'
    assert run(f"SELECT count(*) FROM auth.users WHERE id='{other}'") == '1'
    assert run(public_receipt_sql,role='service_role') == receipt
    checks.append('Changed anchors, a new known copy and a new reference each block identity preparation. The SDK lost-reply check verifies the provider removal after fixture cleanup.')

    auth_only, wallet_only = (identity[name] for name in ('AUTH_ONLY','WALLET_ONLY'))
    run(f"INSERT INTO auth.users VALUES ('{auth_only}','unprovisioned@fixture.invalid','synthetic'); "
        f"INSERT INTO public.twiddles(id,author_id,content) VALUES ('{key(100)}','{auth_only}','Provider-only post'); "
        f"INSERT INTO public.members(id,display_name,wallet_address) VALUES "
        f"('{wallet_only}','Wallet-only fixture','{identity['ONLY_WALLET']}')")
    for req, member, auth, provider in (
        (identity['AUTH_ONLY_REQUEST'],None,auth_only,'supabase'),
        (identity['WALLET_ONLY_REQUEST'],wallet_only,None,'wallet'),
    ):
        subject_key = auth if provider == 'supabase' else member
        assert run(f"SELECT id FROM public.soe_account_deletion_request('{provider}','{subject_key}','{req}','{'7'*64}',4)",
                   role='service_role') == req
        current = exact(req,member,auth)
        call('start_erasure',current)
        for phase in ('private_data','circle_posts','contact_data','circle_departure'):
            reviewed_other = json.loads(call('preview_'+phase,current))
            call('erase_'+phase,current,*([reviewed_other] if phase=='private_data' else [reviewed_other,True]))
        twiddle = scope(current)
        assert twiddle['counts'] == {'posts':int(auth is not None),'collaborators':0,'reactions':0}
        call('erase_twiddle_data',current,twiddle,True)
        current_identity = json.loads(call('preview_identity_removal',current))
        call('prepare_identity_removal',current,current_identity,True)
        if auth is not None:
            sdk(auth,'hard_delete')
        call('verify_identity_removal',current)
    assert run(f"SELECT content FROM public.twiddles WHERE id='{key(7)}'") == 'Historical entry with no recorded author'
    checks.append('Provider-only erasure clears the attributable post. Wallet-only erasure leaves records with unknown authorship intact.')

    archive = temp/'twiddle-erasure.dump'
    restored = 'soe_twiddle_erasure_restored'
    staged.dump(database,archive)
    original.restore(restored,archive)
    def restored_query(sql, role='postgres', sqlstate=None):
        return original.query(restored,'SET ROLE ' + role + '; ' + sql,owner,sqlstate=sqlstate)
    assert restored_query(statement('verify_identity_removal',binding)) == verified
    assert restored_query(statement('erase_twiddle_data',binding,reviewed,True)) == cleared
    assert restored_query(f"SELECT to_jsonb(t) FROM public.twiddles AS t WHERE id='{key(2)}'") == run(
        f"SELECT to_jsonb(t) FROM public.twiddles AS t WHERE id='{key(2)}'")
    restored_query('SELECT * FROM public.twiddles',role='service_role',sqlstate='42501')
    assert restored_query(public_receipt_sql,role='service_role') == receipt
    checks.append('A second restore preserves the anchor, retained reply, archive access, exact erasure retry and pending public receipt.')


def exercise_deletion_restore(staged, original, database, temp, harness, kit, checker, report):
    pending_request, frozen_request, frozen_auth = (key(i) for i in (120,121,122))
    pending_auth = harness['SECOND_AUTH_SUBJECT']
    pending_digest, frozen_digest = '8'*64, '9'*64

    def query(cluster, db, sql, role='postgres'):
        return cluster.query(db, f'SET ROLE {role}; ' + sql)

    def state(cluster, db):
        return [
            query(cluster,db,f"SELECT id FROM public.soe_account_deletion_status('{req}','{digest}')",
                  role='service_role')
            for req, digest in ((pending_request,pending_digest),(frozen_request,frozen_digest))
        ] + [
            query(cluster,db,f"SELECT public.soe_account_erasure_access_allowed('supabase','{auth}')",
                  role='service_role')
            for auth in (pending_auth,frozen_auth)
        ]

    query(staged,database,f"INSERT INTO auth.users VALUES ('{frozen_auth}','frozen@fixture.invalid','synthetic'); "
          f"INSERT INTO auth.flow_state VALUES ('{key(123)}','{frozen_auth}');")
    for req, auth, digest in ((pending_request,pending_auth,pending_digest),(frozen_request,frozen_auth,frozen_digest)):
        assert query(staged,database,f"SELECT id FROM public.soe_account_deletion_request("
                     f"'supabase','{auth}','{req}','{digest}',4)",role='service_role') == req
    query(staged,database,f"SELECT {SCHEMA}.start_erasure('{frozen_request}',NULL,'{frozen_auth}')")
    assert state(staged,database) == [pending_request,frozen_request,'t','f']

    legacy = temp/'deletion-legacy.json'
    reference = temp/'deletion-reference.json'
    full_archive = temp/'deletion-full.dump'
    omitted_archive = temp/'deletion-omitted.dump'
    with harness['export_snapshot'](staged,kit,database=database) as snapshot:
        capture = (*staged.psql(database), '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                   '-f', harness['REFERENCE'], '-c', 'ROLLBACK;')
        legacy.write_text(kit['run']('psql','-v','soe_restore_include_first_release_state=on',*capture)+'\n')
        reference.write_text(kit['run']('psql','-v','soe_restore_include_account_deletion_state=on',*capture)+'\n')
        dump = (*staged.connection(),'--format=custom','--snapshot',snapshot,'-d',database)
        kit['run']('pg_dump',*dump,'--file',full_archive)
        exclude = [f"--exclude-table-data={name if '.' in name else 'public.'+name}"
                   for name in sorted(checker['DELETION_TABLES'])]
        kit['run']('pg_dump',*dump,'--file',omitted_archive,*exclude)
    source = checker['decode_reference'](reference.read_bytes(),checker['ACCOUNT_DELETION_FORMAT'])
    omitted_rows = sorted(name for name in checker['DELETION_TABLES'] if source['tables'][name]['rows'])
    assert len(omitted_rows) == 17
    full, omitted = 'soe_deletion_full', 'soe_deletion_omitted'
    original.restore(full,full_archive)
    original.restore(omitted,omitted_archive)

    def verify(db=full, ref=reference, *, current=True):
        return harness['verify'](ref,original,kit,database=db,
                                 include_account_deletion=current,include_first_release=not current)

    previous_match = verify(omitted,legacy,current=False)
    assert previous_match['status']=='MATCH' and previous_match['tablesCompared']==42
    assert state(original,omitted) == ['', '', 't','t']
    report['checks'].append('The older reference matches an incomplete archive that loses the request codes and reopens a frozen account.')
    matched = verify()
    assert matched['status']=='MATCH' and matched['tablesCompared']==63 and matched['accountDeletionRoutinesMatch']
    mismatch = verify(omitted)
    assert mismatch == {**matched,'status':'MISMATCH','rowsDiffer':omitted_rows}, mismatch
    assert state(original,full) == [pending_request,frozen_request,'t','f']
    assert query(original,full,f"SELECT count(*) FROM auth.users WHERE id='{frozen_auth}'") == '1'
    assert query(original,full,f"SELECT count(*) FROM {SCHEMA}.identity_removals WHERE verified_at IS NOT NULL") == '3'
    assert query(original,full,f"SELECT count(*) FROM {SCHEMA}.twiddle_erasure_targets") == '3'
    report['checks'].append('The full restore matches all 63 tables and preserves receipts, access blocks, verified identities and archived anchors.')

    changes = (
        ('ALTER FUNCTION public.soe_account_erasure_access_allowed(text,uuid) SECURITY DEFINER',
         'ALTER FUNCTION public.soe_account_erasure_access_allowed(text,uuid) SECURITY INVOKER',
         {'accountDeletionRoutinesMatch':False}),
        ('GRANT USAGE ON SCHEMA soe_account_deletion_private TO authenticated',
         'REVOKE USAGE ON SCHEMA soe_account_deletion_private FROM authenticated',
         {'roleAndSchemaAccessMatch':False}),
        ('GRANT SELECT(content) ON public.twiddles TO service_role',
         'REVOKE SELECT(content) ON public.twiddles FROM service_role',
         {'definitionsDiffer':['twiddles']}),
        ('CREATE PUBLICATION fixture_deletion_publication FOR TABLE public.twiddle_reactions',
         'DROP PUBLICATION fixture_deletion_publication',
         {'definitionsDiffer':['twiddle_reactions']}),
    )
    for change, undo, expected in changes:
        query(original,full,change)
        assert verify(full,legacy,current=False) == previous_match
        assert verify() == {**matched,'status':'MISMATCH',**expected}
        query(original,full,undo)
    assert verify() == matched
    report['checks'].append('The expanded check detects changes to deletion routines, private schema access, archived column grants and replication exposure.')

    old_reference = verify(full,legacy)
    assert old_reference['status']=='UNAVAILABLE' and old_reference['check']=='private_reference_invalid'
    query(original,omitted,f'DROP FUNCTION {SCHEMA}.preview_twiddle_erasure(uuid,uuid,uuid)')
    missing_routine = verify(omitted)
    assert missing_routine['status']=='UNAVAILABLE' and missing_routine['check']=='local_snapshot_unavailable'
    query(original,full,f'DROP TABLE {SCHEMA}.identity_removal_context')
    missing_table = verify()
    assert missing_table['status']=='UNAVAILABLE' and missing_table['check']=='local_snapshot_unavailable'
    report['checks'].append('The expanded verifier refuses an older reference, a missing required routine and a missing expected table.')
    report['deletionRestore'] = {
        'previousFormatOmission':previous_match,'partialRestore':mismatch,'completeRestore':matched,
        'olderReferenceRefused':old_reference,'missingRoutineRefused':missing_routine,'missingTableRefused':missing_table,
    }


def exercise_voice_restore(original, staged, database, temp, harness, kit, checker, report):
    waddle = runpy.run_path(str(SCRIPT.with_name('rehearse-waddle-privacy.py')))
    voice_title = 'Synthetic public recording'
    reviewed = '2026-11-06 10:06:00+00'

    def run(cluster, db, sql, role='postgres', **options):
        return cluster.query(db, f'SET ROLE {role}; ' + sql, **options)

    if not original.query(database, "SELECT to_regprocedure('auth.uid()')"):
        original.query(database, "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'")
    run(original,database,twiddle_schema(harness['resident']))
    run(original,database,f"""
      INSERT INTO public.twiddles(id,author_id,content,twiddle_type,thread_type,voice_url)
        VALUES ('{key(140)}','{harness['AUTH_SUBJECT']}','Synthetic old recording','voice','open','fixture.wav');
      INSERT INTO public.twiddle_collaborators(id,twiddle_id,user_id,contribution_type)
        VALUES ('{key(141)}','{key(140)}','{harness['SECOND_AUTH_SUBJECT']}','voice');
      INSERT INTO public.twiddle_reactions(id,twiddle_id,user_id,reaction_type)
        VALUES ('{key(142)}','{key(140)}','{harness['SECOND_AUTH_SUBJECT']}','question');
    """)
    for cluster in (original, staged):
        run(cluster,database,waddle['FIXTURE'])
    kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', waddle['DRAFT'])
    assert run(staged,database,"SELECT count(*) FROM public.waddles WHERE public_consent_at IS NOT NULL") == '0'
    run(staged,database,f"UPDATE public.waddles SET public_consent_at='{reviewed}' WHERE transcription='{voice_title}'")
    report['orderedMigrationFiles'].append(str(waddle['DRAFT'].relative_to(ROOT)))

    for label, source, post, omitted_tables in (
        ('before', original, False, sorted(checker['VOICE_ARCHIVE_TABLES'])),
        ('after', staged, True, ['waddles']),
    ):
        legacy_ref, voice_ref = [temp / f'voice-{label}-{name}.json' for name in ('legacy','current')]
        complete_dump, incomplete_dump = [temp / f'voice-{label}-{name}.dump' for name in ('full','omitted')]
        old_flag = 'soe_restore_include_account_deletion_state=on' if post else 'soe_restore_include_circles=on'
        with harness['export_snapshot'](source,kit,database=database) as snapshot:
            capture = (*source.psql(database), '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                       '-f', harness['REFERENCE'], '-c', 'ROLLBACK;')
            legacy_ref.write_text(kit['run']('psql','-v',old_flag,*capture)+'\n')
            voice_ref.write_text(kit['run']('psql','-v',old_flag,'-v','soe_restore_include_voice_archive=on',*capture)+'\n')
            dump = (*source.connection(),'--format=custom','--snapshot',snapshot,'-d',database)
            kit['run']('pg_dump',*dump,'--file',complete_dump)
            kit['run']('pg_dump',*dump,'--file',incomplete_dump,*(f'--exclude-table-data=public.{name}' for name in omitted_tables))
        complete, incomplete = f'soe_voice_{label}_full', f'soe_voice_{label}_omitted'
        original.restore(complete,complete_dump)
        original.restore(incomplete,incomplete_dump)

        def verify(db, ref=voice_ref, current=True):
            return harness['verify'](ref,original,kit,database=db,include_circles=not post,
                                     include_account_deletion=post,include_voice_archive=current)

        old = verify(incomplete,legacy_ref,current=False)
        assert old['status']=='MATCH' and old['tablesCompared']==(63 if post else 20), old
        matched = verify(complete)
        assert matched['status']=='MATCH' and matched['tablesCompared']==(64 if post else 24), matched
        missing = verify(incomplete)
        assert missing == {**matched,'status':'MISMATCH','rowsDiffer':omitted_tables}, missing
        assert verify(complete,legacy_ref)['check']=='private_reference_invalid'
        report['voiceRestore'][label] = {'olderMatchWithOmissions':old,'completeRestore':matched,'partialRestore':missing}

        if post:
            assert run(original,complete,f"SELECT transcription FROM public.waddles WHERE is_public "
                       f"AND public_consent_at='{reviewed}'",role='service_role') == voice_title
            for role in ('anon','authenticated'):
                run(original,complete,'SELECT transcription FROM public.waddles',role=role,sqlstate='42501')
            run(original,complete,f"UPDATE public.waddles SET public_consent_at=NULL WHERE transcription='{voice_title}'")
            assert verify(complete) == {**matched,'status':'MISMATCH','rowsDiffer':['waddles']}
            run(original,complete,f"UPDATE public.waddles SET public_consent_at='{reviewed}' WHERE transcription='{voice_title}'")
            for change, undo in (
                ('GRANT SELECT(audio_url) ON public.waddles TO anon','REVOKE SELECT(audio_url) ON public.waddles FROM anon'),
                ('CREATE PUBLICATION voice_fixture_pub FOR TABLE public.waddles','DROP PUBLICATION voice_fixture_pub'),
                ('COMMENT ON COLUMN public.waddles.public_consent_at IS NULL',
                 "COMMENT ON COLUMN public.waddles.public_consent_at IS 'soe:waddle-public-consent:v1'"),
            ):
                run(original,complete,change)
                assert verify(complete) == {**matched,'status':'MISMATCH','definitionsDiffer':['waddles']}
                run(original,complete,undo)
            assert verify(complete) == matched
            run(original,incomplete,'ALTER TABLE public.waddles DROP COLUMN public_consent_at')
            assert verify(incomplete)['check']=='local_snapshot_unavailable'
            report['checks'].append('The release restore preserves Waddle consent and the browser denial. It detects consent, grant, publication and column-provenance drift and refuses a missing consent column.')
    report['checks'].append('The 24-table and 64-table scopes catch missing voice records that matched the older references.')


def main():
    os.umask(0o077)
    identity = runpy.run_path(str(SCRIPT.with_name('rehearse-identity-removal.py')))
    previous = runpy.run_path(str(SCRIPT.with_name('rehearse-circle-departure.py')))
    contact = runpy.run_path(str(SCRIPT.with_name('rehearse-contact-erasure.py')))
    drafts = [*contact['DRAFTS'], ROOT/'docs/sql/account-erasure-circle-relationships-apply.sql']
    release = runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL','CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    report = {'checks': [], 'providerSdk': [], 'closedRoleOperations': 0, 'voiceRestore': {}, 'productionRestoreVerified': False}
    with TemporaryDirectory(prefix='soe-circle-departure-',dir='/private/tmp') as directory:
        temp = Path(directory)
        original, staged = [kit['Cluster'](temp/name,owner) for name in ('original','staged')]
        try:
            subprocess.run(['/opt/homebrew/bin/node','--require',str(release['NETWORK_GUARD']),
                            str(release['EXPORT_FIXTURE']),str(temp)],env=kit['ENV'],cwd=ROOT,
                           check=True,timeout=20,stdout=subprocess.DEVNULL)
            report['fixture'] = json.loads((temp/'inputs.json').read_bytes())
            original.start()
            staged.start()
            release['stage_restored_release'](original,staged,database,temp,harness,kit,checker,report)
            exercise(staged,original,database,owner,temp,release,harness,kit,previous,identity,drafts,report)
            exercise_deletion_restore(staged,original,database,temp,harness,kit,checker,report)
            exercise_voice_restore(original,staged,database,temp,harness,kit,checker,report)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    report.update(status='PASS',clustersStopped=True,temporaryDirectoryRemoved=True,draftSha256=kit['digest'](DRAFT),
                  twiddleFixtureSha256=kit['digest'](FIXTURE))
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
