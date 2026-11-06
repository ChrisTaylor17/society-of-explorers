"""Verify reviewed provider identity removal against an isolated release restore."""
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
SCHEMA = 'soe_account_deletion_private'
AUTH_ONLY = '75000000-0000-4000-8000-000000000001'
WALLET_ONLY = '75000000-0000-4000-8000-000000000002'
AUTH_ONLY_REQUEST = '75000000-0000-4000-8000-000000000003'
WALLET_ONLY_REQUEST = '75000000-0000-4000-8000-000000000004'
WALLET = '0x' + '1c' * 20
ONLY_WALLET = '0x' + '2d' * 20
OTHER_TWIDDLE = '75000000-0000-4000-8000-000000000021'
LATE_REACTION = '75000000-0000-4000-8000-000000000026'
DRAFT = ROOT / 'docs/sql/account-erasure-identity-apply.sql'


def install_provider_fixture(run, subject, other, host):
    run(f"""
      ALTER TABLE auth.identities DROP CONSTRAINT identities_user_id_fkey,
        ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
      CREATE TABLE auth.refresh_tokens(
        id bigint PRIMARY KEY,session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE,user_id varchar(255),token text
      );
      CREATE TABLE auth.flow_state(id uuid PRIMARY KEY,user_id uuid);
      ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
      ALTER TABLE auth.refresh_tokens OWNER TO supabase_auth_admin;
      ALTER TABLE auth.flow_state OWNER TO supabase_auth_admin;
      INSERT INTO auth.sessions VALUES
        ('75000000-0000-4000-8000-000000000010','{subject}'),
        ('75000000-0000-4000-8000-000000000011','{subject}'),
        ('75000000-0000-4000-8000-000000000012','{other}');
      INSERT INTO auth.refresh_tokens VALUES
        (1,'75000000-0000-4000-8000-000000000010','{subject}','synthetic refresh token one'),
        (2,'75000000-0000-4000-8000-000000000011','{subject}','synthetic refresh token two'),
        (3,'75000000-0000-4000-8000-000000000012','{other}','synthetic unrelated refresh token');
      INSERT INTO auth.flow_state VALUES ('75000000-0000-4000-8000-000000000013','{subject}');
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects(id int PRIMARY KEY,owner uuid,owner_id text);
      CREATE TABLE storage.buckets(id text PRIMARY KEY,owner_id text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
      INSERT INTO storage.objects VALUES (1,'{subject}',NULL),(2,NULL,'{subject}'),(3,NULL,'{other}'),(4,NULL,NULL);
      INSERT INTO storage.buckets VALUES ('subject-owned-fixture','{subject}'),('other-owned-fixture','{other}');
      INSERT INTO auth.users(id) SELECT DISTINCT supabase_auth_id FROM public.members WHERE supabase_auth_id IS NOT NULL
        ON CONFLICT (id) DO NOTHING;
      -- The hosted catalog has this cascade and three non-cascading Twiddle links.
      ALTER TABLE public.members ADD CONSTRAINT fixture_auth_member_link
        FOREIGN KEY(supabase_auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;
      CREATE TABLE public.twiddles(id uuid PRIMARY KEY,author_id uuid REFERENCES auth.users(id),body text);
      CREATE TABLE public.twiddle_collaborators(
        id uuid PRIMARY KEY,twiddle_id uuid REFERENCES public.twiddles(id),user_id uuid REFERENCES auth.users(id));
      CREATE TABLE public.twiddle_reactions(
        id uuid PRIMARY KEY,twiddle_id uuid REFERENCES public.twiddles(id),user_id uuid REFERENCES auth.users(id));
      INSERT INTO public.twiddles VALUES
        ('75000000-0000-4000-8000-000000000020','{subject}','Reviewed fixture post'),
        ('{OTHER_TWIDDLE}','{other}','Other author fixture post');
      INSERT INTO public.twiddle_collaborators VALUES
        ('75000000-0000-4000-8000-000000000022','{OTHER_TWIDDLE}','{subject}'),
        ('75000000-0000-4000-8000-000000000023','{OTHER_TWIDDLE}','{other}');
      INSERT INTO public.twiddle_reactions VALUES
        ('75000000-0000-4000-8000-000000000024','{OTHER_TWIDDLE}','{subject}'),
        ('75000000-0000-4000-8000-000000000025','{OTHER_TWIDDLE}','{other}');
      UPDATE public.members SET wallet_address='{WALLET}' WHERE id='{host}';
    """)


def exercise(staged, original, database, owner, temp, release, harness, kit, previous, drafts, report):
    host, reader = (release[name] for name in ('HOST','READER'))
    subject, other = (harness[name] for name in ('AUTH_SUBJECT','SECOND_AUTH_SUBJECT'))
    request, digest = previous['REQUEST'], previous['DIGEST']

    def run(sql, *, role='postgres', sqlstate=None):
        return staged.query(database, f'SET ROLE {role};\n' + sql, owner, sqlstate=sqlstate)

    def exact(req, member, auth):
        return ','.join(release['literal'](value) for value in (req, member, auth))

    def call(function, binding, *args, **kwargs):
        tail = ''.join(',' + release['literal'](value) for value in args)
        return run(f'SELECT {SCHEMA}.{function}({binding}{tail})', **kwargs)

    def preview(binding):
        return json.loads(call('preview_identity_removal',binding))

    def prepare(binding, scope, approval=True, **kwargs):
        return call('prepare_identity_removal', binding, scope, approval, **kwargs)

    def sdk(auth, mode):
        result = subprocess.run([
            '/opt/homebrew/bin/node','--require','./scripts/deny-build-network.cjs',
            './tests/support/identity-removal-auth.mjs',str(kit['BIN'] / 'psql'),str(staged.socket),
            kit['PORT'],database,owner,auth,mode,
        ], cwd=ROOT / 'verification/web', env=kit['ENV'], capture_output=True, text=True, timeout=15)
        assert result.returncode == 0, result.stderr[-2800:]
        report['providerSdk'].append(json.loads(result.stdout))

    install_provider_fixture(run, subject, other, host)
    previous['exercise'](staged, original, database, owner, temp, release, harness, kit, drafts, report)
    kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', DRAFT)
    report['orderedMigrationFiles'].append(str(DRAFT.relative_to(ROOT)))
    assert len(report['orderedMigrationFiles']) == 55
    checks = report['checks']
    binding = exact(request, host, subject)
    original_status = run(f"SELECT to_jsonb(r) FROM public.soe_account_deletion_status('{request}','{digest}') AS r",
                          role='service_role')

    blocked = preview(binding)
    assert blocked['phase']=='review' and blocked['hasProvider'] and blocked['hasWallet']
    assert blocked['provider']['userPresent']
    assert blocked['provider']['ownedStorage']=={'storage.objects':2,'storage.buckets':1}
    assert blocked['provider']['relatedRecords']=={'sessions':2,'refresh_tokens':2,'identities':1,'flow_state':1}
    prepare(binding, blocked, sqlstate='PT409')
    call('verify_identity_removal',binding,sqlstate='PT409')
    for role in ('anon','authenticated','service_role'):
        call('preview_identity_removal',binding,role=role,sqlstate='42501')
        prepare(binding,blocked,role=role,sqlstate='42501')
        call('verify_identity_removal',binding,role=role,sqlstate='42501')
        run(f'INSERT INTO {SCHEMA}.identity_removal_context VALUES(pg_current_xact_id(),\'{request}\')',
            role=role,sqlstate='42501')
    checks.append('The exact owner-only review counts Auth and both forms of storage ownership and refuses premature preparation.')

    run(f"""
      CREATE ROLE fixture_scoped_reader;
      GRANT USAGE ON SCHEMA auth,storage,{SCHEMA} TO fixture_scoped_reader;
      GRANT SELECT ON ALL TABLES IN SCHEMA auth,storage TO fixture_scoped_reader;
      GRANT EXECUTE ON FUNCTION {SCHEMA}.identity_provider_scope(uuid) TO fixture_scoped_reader;
    """)
    call('identity_provider_scope', f"'{subject}'",role='fixture_scoped_reader',sqlstate='42501')
    run('DROP OWNED BY fixture_scoped_reader; DROP ROLE fixture_scoped_reader')

    # Only fixture storage ownership is modified here. Hosted objects require
    # the actual Storage workflow and separate owner review.
    run("DELETE FROM storage.objects WHERE id IN (1,2); DELETE FROM storage.buckets WHERE id='subject-owned-fixture'")
    external = preview(binding)
    assert external['provider']['otherReferences']=={
        'public.twiddles.author_id':1,'public.twiddle_collaborators.user_id':1,'public.twiddle_reactions.user_id':1,
    }
    prepare(binding,external,sqlstate='PT409')
    # Simulate dispositions reviewed separately on this synthetic data.
    run(f"UPDATE public.twiddles SET author_id=NULL WHERE author_id='{subject}'; "
        f"DELETE FROM public.twiddle_collaborators WHERE user_id='{subject}'; "
        f"DELETE FROM public.twiddle_reactions WHERE user_id='{subject}'")
    run('CREATE TABLE public.fixture_provider_cascade(owner uuid REFERENCES auth.users(id) ON DELETE CASCADE)')
    call('preview_identity_removal',binding,sqlstate='PT409')
    run('DROP TABLE public.fixture_provider_cascade')
    checks.append('Filtered storage reads, the three observed Twiddle links and an unknown cascade all stop owner preparation.')

    scope = preview(binding)
    prepare(binding,blocked,sqlstate='PT409')
    prepare(binding,scope,False,sqlstate='PT409')
    call('preview_identity_removal',exact(request,reader,subject),sqlstate='PT409')
    run(f"UPDATE public.members SET wallet_address=NULL,supabase_auth_id=NULL WHERE id='{host}'",sqlstate='PT403')
    run(f'ALTER TABLE {SCHEMA}.identity_removals ADD CONSTRAINT fixture_failure CHECK(false)')
    prepare(binding,scope,sqlstate='23514')
    assert preview(binding)==scope
    assert run(f"SELECT supabase_auth_id,wallet_address FROM public.members WHERE id='{host}'")==f'{subject}|{WALLET}'
    assert run(f'SELECT count(*) FROM {SCHEMA}.identity_removal_context')=='0'
    run(f'ALTER TABLE {SCHEMA}.identity_removals DROP CONSTRAINT fixture_failure')
    prepared = prepare(binding,scope)
    assert prepare(binding,scope)==prepared
    assert run(f"SELECT supabase_auth_id IS NULL AND wallet_address IS NULL FROM public.members WHERE id='{host}'")=='t'
    assert preview(binding)['phase']=='prepared'
    run(f"UPDATE public.members SET wallet_address='{WALLET.upper()}' WHERE id='{reader}'",role='service_role',sqlstate='PT403')
    run(f"UPDATE public.members SET supabase_auth_id='{subject}' WHERE id='{reader}'",role='service_role',sqlstate='PT403')
    assert run(f"SELECT public.soe_account_erasure_access_allowed('supabase','{subject}'),"
               f"public.soe_account_erasure_access_allowed('wallet','{host}')",role='service_role')=='f|f'
    checks.append('Preparation is atomic, retryable and limited to the exact account. The old identities remain blocked after detachment.')

    for mode in ('refused','ack_only'):
        sdk(subject,mode)
        call('verify_identity_removal',binding,sqlstate='PT409')
        assert preview(binding)['phase']=='prepared'
    run(f"INSERT INTO public.twiddle_reactions VALUES ('{LATE_REACTION}','{OTHER_TWIDDLE}','{subject}')")
    prepare(binding,scope,sqlstate='PT409')
    sdk(subject,'reference_blocks')
    call('verify_identity_removal',binding,sqlstate='PT409')
    run(f"DELETE FROM public.twiddle_reactions WHERE id='{LATE_REACTION}'")
    sdk(subject,'commit_without_reply')
    assert preview(binding)['provider']['relatedRecords']=={'flow_state':1}
    call('verify_identity_removal',binding,sqlstate='PT409')
    sdk(subject,'lookup_absent')
    run(f"DELETE FROM auth.flow_state WHERE user_id='{subject}'",role='supabase_auth_admin')
    verified = call('verify_identity_removal',binding)
    assert call('verify_identity_removal',binding)==verified
    assert prepare(binding,scope)==prepared
    assert preview(binding)['phase']=='verified'
    assert run(f"SELECT display_name FROM public.members WHERE id='{host}'")=='Former member'
    assert run(f"SELECT supabase_auth_id FROM public.members WHERE id='{reader}'")==other
    assert run(f"SELECT count(*) FROM auth.refresh_tokens WHERE user_id='{other}'")=='1'
    assert run(f"SELECT count(*) FROM public.twiddle_reactions WHERE user_id='{other}'")=='1'
    assert run('SELECT count(*) FROM storage.objects')=='2'
    assert run(f"SELECT to_jsonb(r) FROM public.soe_account_deletion_status('{request}','{digest}') AS r",
               role='service_role')==original_status
    checks.append('Provider refusal, a late Twiddle reference and residual provider data leave verification pending. A lost reply can be checked without another deletion, and the prepared member survives the observed cascade.')

    def process_other(req, member, auth, provider):
        owner_subject = auth if provider=='supabase' else member
        status_hash = '7'*64
        assert run(f"SELECT id FROM public.soe_account_deletion_request('{provider}','{owner_subject}','{req}','{status_hash}',4)",
                   role='service_role')==req
        current = exact(req,member,auth)
        call('start_erasure',current)
        call('preview_identity_removal',current,sqlstate='PT409')
        for phase in ('private_data','circle_posts','contact_data','circle_departure'):
            reviewed = json.loads(call('preview_'+phase,current))
            args = [reviewed] if phase=='private_data' else [reviewed,True]
            call('erase_'+phase,current,*args)
        return current

    run(f"INSERT INTO auth.users VALUES ('{AUTH_ONLY}','unprovisioned@fixture.invalid','synthetic auth only hash'); "
        f"INSERT INTO public.members(id,display_name,wallet_address) VALUES ('{WALLET_ONLY}','Wallet fixture','{ONLY_WALLET}')")
    auth_binding = process_other(AUTH_ONLY_REQUEST,None,AUTH_ONLY,'supabase')
    auth_scope = preview(auth_binding)
    assert not auth_scope['hasMember'] and auth_scope['hasProvider'] and not auth_scope['hasWallet']
    prepare(auth_binding,auth_scope)
    sdk(AUTH_ONLY,'hard_delete')
    call('verify_identity_removal',auth_binding)
    wallet_binding = process_other(WALLET_ONLY_REQUEST,WALLET_ONLY,None,'wallet')
    wallet_scope = preview(wallet_binding)
    assert wallet_scope['hasMember'] and wallet_scope['hasWallet'] and not wallet_scope['hasProvider']
    prepare(wallet_binding,wallet_scope)
    call('verify_identity_removal',wallet_binding)
    assert preview(wallet_binding)['phase']=='verified'
    checks.append('Provider-only accounts and wallet-only members can both verify removal without creating a new member or calling an unrelated provider.')

    archive = temp / 'identity-removal.dump'
    staged.dump(database,archive)
    restored = 'soe_identity_removal_restored'
    original.restore(restored,archive)
    def from_restore(sql):
        return original.query(restored,'SET ROLE postgres; ' + sql,owner)
    assert from_restore(f'SELECT {SCHEMA}.verify_identity_removal({binding})')==verified
    assert from_restore(f"SELECT count(*) FROM auth.users WHERE id='{subject}'")=='0'
    assert from_restore(f"SELECT count(*) FROM auth.users WHERE id='{other}'")=='1'
    assert from_restore(f"SELECT count(*) FROM {SCHEMA}.identity_removals WHERE verified_at IS NOT NULL")=='3'
    checks.append('A separate restore preserves each verified identity phase, the unrelated provider account and the original pending public receipt.')


def main():
    os.umask(0o077)
    previous = runpy.run_path(str(SCRIPT.with_name('rehearse-circle-departure.py')))
    contact = runpy.run_path(str(SCRIPT.with_name('rehearse-contact-erasure.py')))
    drafts = [*contact['DRAFTS'], ROOT / 'docs/sql/account-erasure-circle-relationships-apply.sql']
    release = runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL','CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    report = {'checks': [], 'providerSdk': [], 'productionRestoreVerified': False}
    with TemporaryDirectory(prefix='soe-circle-departure-',dir='/private/tmp') as directory:
        temp = Path(directory)
        original, staged = [kit['Cluster'](temp / name,owner) for name in ('original','staged')]
        try:
            subprocess.run(['/opt/homebrew/bin/node','--require',str(release['NETWORK_GUARD']),
                            str(release['EXPORT_FIXTURE']),str(temp)],env=kit['ENV'],cwd=ROOT,
                            check=True,timeout=20,stdout=subprocess.DEVNULL)
            report['fixture'] = json.loads((temp / 'inputs.json').read_bytes())
            original.start()
            staged.start()
            release['stage_restored_release'](original,staged,database,temp,harness,kit,checker,report)
            exercise(staged,original,database,owner,temp,release,harness,kit,previous,drafts,report)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    report.update(status='PASS',clustersStopped=True,temporaryDirectoryRemoved=True,draftSha256=kit['digest'](DRAFT))
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
