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


def seed_twiddle(run, subject, other, resident):
    # The identity fixture predates the live-shaped Twiddle review. Keep its
    # provider/storage setup and replace only its three synthetic Twiddle tables.
    run('DROP TABLE public.twiddle_collaborators,public.twiddle_reactions,public.twiddles RESTRICT')
    source = resident(FIXTURE).decode()
    first = 'CREATE TABLE public.twiddles ('
    last = 'GRANT SELECT (id) ON public.twiddles TO fixture_audit;'
    assert source.count(first) == source.count(last) == 1
    run(source[source.index(first):source.index(last)])
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
    report = {'checks': [], 'providerSdk': [], 'closedRoleOperations': 0, 'productionRestoreVerified': False}
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
