"""Rehearse exact voice-post erasure on a disposable restore and object store."""
from hashlib import sha256
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import time

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
SCHEMA = 'soe_account_deletion_private'
DRAFT = ROOT / 'docs/sql/account-erasure-waddle-apply.sql'
ORIGIN = 'https://waddle-fixture.invalid'


def row_id(number):
    return f'79000000-0000-4000-8000-{number:012d}'


def exercise(original, staged, database, owner, temp, release, harness, kit, checker, previous, report):
    member, other = (release[name] for name in ('HOST', 'READER'))
    auth = harness['AUTH_SUBJECT']
    request, status_code = previous['REQUEST'], previous['DIGEST']
    checks = report['waddleChecks']
    waddle = runpy.run_path(str(SCRIPT.with_name('rehearse-waddle-privacy.py')))

    def run(sql, *, role='postgres', sqlstate=None, cluster=staged, db=database):
        return cluster.query(db, f'SET ROLE {role};\n' + sql, owner, sqlstate=sqlstate)

    def apply(file, sqlstate=None):
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', file, sqlstate=sqlstate)
        if sqlstate is None:
            report['orderedMigrationFiles'].append(str(file.relative_to(ROOT)))

    def statement(name, *values, binding=None):
        params = (request, member, auth) if binding is None else binding
        args = ','.join(map(release['literal'], (*params, *values)))
        return f'SELECT {SCHEMA}.{name}({args})'

    def preview(origin=ORIGIN, **options):
        return json.loads(run(statement('preview_waddle_erasure', origin), **options))

    def prepare(digest, approved=True, origin=ORIGIN, **options):
        return run(statement('prepare_waddle_erasure', origin, digest, approved), **options)

    def clear(digest, absent, binding=None, **options):
        account = (request,member,auth) if binding is None else binding
        params = ','.join(map(release['literal'], (*account,digest)))
        keys = ','.join(map(release['literal'], absent))
        return run(f'SELECT {SCHEMA}.clear_waddle_erasure({params},ARRAY[{keys}]::text[])', **options)

    def http(mode, cluster=staged, db=database):
        result = subprocess.run([
            '/opt/homebrew/bin/node','--require','./scripts/deny-build-network.cjs',
            './tests/support/waddle-privacy-http.mjs',str(kit['BIN']/'psql'),str(cluster.socket),
            kit['PORT'],db,owner,member,mode,
        ], cwd=ROOT/'verification/web', env=kit['ENV'], capture_output=True, text=True, timeout=20)
        assert result.returncode == 0, result.stderr[-3200:]
        report['waddleHttp'].append(json.loads(result.stdout))

    legacy = member + '/1793960000000.webm'
    current = member + '/1793960000001-79000000-0000-4000-8000-000000000010.webm'
    orphan = member + '/1793960000002.webm'
    retained = other + '/1793960000003.webm'
    wrong_owner = member + '/1793960000004.webm'
    missing = member + '/1793960000005.webm'
    audio_url = f'{ORIGIN}/storage/v1/object/public/waddles/{legacy}'
    keys = [legacy,current,orphan,missing]
    run(waddle['FIXTURE'].split('INSERT INTO public.waddles',1)[0])
    run("""
      ALTER TABLE storage.buckets ADD COLUMN public boolean;
      ALTER TABLE storage.buckets ADD COLUMN versioning_status text;
      ALTER TABLE storage.objects ADD COLUMN bucket_id text REFERENCES storage.buckets(id);
      ALTER TABLE storage.objects ADD COLUMN name text;
      ALTER TABLE storage.objects ADD COLUMN is_versioned boolean;
      INSERT INTO storage.buckets(id,public) VALUES ('waddles',false);
    """)
    for number,key in enumerate([legacy,current,orphan,retained],100):
        run(f"INSERT INTO storage.objects(id,bucket_id,name) VALUES ({number},'waddles','{key}')")
    run(f"""
      INSERT INTO public.waddles(id,member_id,audio_url,transcription,is_public) VALUES
        ('{row_id(1)}','{member}','{audio_url}','Synthetic departing legacy voice',true),
        ('{row_id(2)}','{member}','{current}','Synthetic departing current voice',true),
        ('{row_id(3)}','{member}','','Synthetic departing transcript only',true),
        ('{row_id(4)}','{other}','{retained}','Synthetic retained voice',true),
        ('{row_id(5)}',NULL,NULL,'Synthetic voice with unknown author',false),
        ('{row_id(6)}','{member}','{missing}','Synthetic voice missing its catalog row',false);
    """)
    apply(waddle['DRAFT'])
    run(f"UPDATE public.waddles SET public_consent_at=now() WHERE is_public IS TRUE")
    same_receipt = statement('verify_identity_removal')
    verified_before = run(same_receipt)
    public_receipt = f"SELECT to_jsonb(r) FROM public.soe_account_deletion_status('{request}','{status_code}') AS r"
    pending = run(public_receipt,role='service_role')
    assert run(f"SELECT count(*) FROM public.waddles WHERE member_id='{member}'") == '4'
    assert run(f"SELECT count(*) FROM storage.objects WHERE name LIKE '{member}/%'") == '3'
    http('read-erasure-before')
    checks.append('The preceding identity verifier still succeeds while the same member has voice posts and ownerless files.')

    run("UPDATE storage.buckets SET public=true WHERE id='waddles'")
    apply(DRAFT,'PT409')
    assert run(f"SELECT to_regclass('{SCHEMA}.waddle_erasure_receipts') IS NULL") == 't'
    run("UPDATE storage.buckets SET public=false WHERE id='waddles'")
    apply(DRAFT)
    run(same_receipt,sqlstate='PT409')
    run(statement('preview_identity_removal'),sqlstate='PT409')
    checks.append('A public bucket stops installation atomically. The new identity guard requires a separate voice-post receipt.')

    rejected = 0
    for role in ('anon','authenticated','service_role'):
        for sql in (
            f'SELECT * FROM {SCHEMA}.waddle_erasure_receipts',
            statement('preview_waddle_erasure',ORIGIN),
            statement('prepare_waddle_erasure',ORIGIN,'0'*64,True),
            f"SELECT {SCHEMA}.clear_waddle_erasure('{request}','{member}','{auth}','{'0'*64}',ARRAY[]::text[])",
        ):
            run(sql,role=role,sqlstate='42501')
            rejected += 1
    report['waddleRoleDenials'] = rejected

    review = preview()
    assert review['phase']=='review' and review['keys']==keys and review['rowCount']==4
    assert review['blockers']=={'unresolvedRows':[],'mintedRows':[],'sharedRows':[],'unreviewedObjects':[]}
    assert 'Synthetic' not in json.dumps(review)
    assert preview('https://wrong-project.invalid')['blockers']['unresolvedRows']==[row_id(1)]
    run(statement('preview_waddle_erasure',ORIGIN+'/path'),sqlstate='PT409')
    run(statement('preview_waddle_erasure',ORIGIN,binding=(request,other,auth)),sqlstate='PT409')
    prepare(review['scopeDigest'],False,sqlstate='PT409')
    checks.append('The owner review includes the exact legacy, current, orphan and missing keys without returning any transcript or object metadata.')

    changed = f"""
      BEGIN;
      ALTER TABLE public.waddles DISABLE TRIGGER soe_guard_waddle_erasure_write;
      INSERT INTO public.waddles(id,member_id,audio_url,transcription,nft_token_id) VALUES
        ('{row_id(8)}','{member}','https://unrelated.invalid/audio','Synthetic external voice','minted'),
        ('{row_id(9)}','{other}','{legacy}','Synthetic cross reference',NULL);
      ALTER TABLE public.waddles ENABLE TRIGGER soe_guard_waddle_erasure_write;
      INSERT INTO storage.objects(id,bucket_id,name,owner_id,is_versioned)
        VALUES (120,'waddles','{wrong_owner}','{harness['SECOND_AUTH_SUBJECT']}',true);
    """
    flagged = json.loads(run(changed + statement('preview_waddle_erasure',ORIGIN) + '; ROLLBACK;'))
    assert flagged['blockers']=={'unresolvedRows':[row_id(8)],'mintedRows':[row_id(8)],
        'sharedRows':[row_id(9)],'unreviewedObjects':[wrong_owner]}
    run(changed + statement('prepare_waddle_erasure',ORIGIN,flagged['scopeDigest'],True),sqlstate='PT409')
    assert preview()==review
    checks.append('Shared, foreign, minted and versioned references remain separate blockers. Their exact review cannot authorize removal.')

    def service_insert(target, key, number):
        return (f"INSERT INTO public.waddles(id,member_id,audio_url,transcription,is_public,public_consent_at)"
                f" VALUES ('{row_id(number)}','{target}','{key}','Synthetic new post',true,now())")

    for sql in (
        service_insert(member,legacy,11), service_insert(other,legacy,12),
        f"UPDATE public.waddles SET member_id='{other}' WHERE id='{row_id(1)}'",
        f"UPDATE public.waddles SET transcription='Changed' WHERE id='{row_id(2)}'",
    ):
        run(sql,role='service_role',sqlstate='PT403')
    run('BEGIN; ' + service_insert(other,retained,13) + '; ROLLBACK;',role='service_role')
    run(f"BEGIN; UPDATE public.waddles SET is_public=false,public_consent_at=NULL WHERE id='{row_id(1)}'; "
        + statement('prepare_waddle_erasure',ORIGIN,review['scopeDigest'],True),sqlstate='PT409')
    assert preview()==review
    checks.append('Held writes cannot recreate or transfer a frozen voice post, while an unrelated member can still publish. A changed row makes the old review stale.')

    digest = review['scopeDigest']
    run(f"BEGIN; ALTER TABLE {SCHEMA}.waddle_erasure_receipts ADD CONSTRAINT fixture_failure CHECK(false); "
        + statement('prepare_waddle_erasure',ORIGIN,digest,True),sqlstate='23514')
    assert preview()==review
    assert run(f"SELECT is_public AND public_consent_at IS NOT NULL FROM public.waddles WHERE id='{row_id(1)}'")=='t'
    prepared = prepare(digest)
    storage = preview()
    assert storage['phase']=='storage' and storage['keys']==keys and len(storage['remainingCatalogKeys'])==3
    assert storage['catalogMissingAtPreparation']==[missing]
    assert prepare(digest)==prepared
    assert run(f"SELECT count(*) FROM public.waddles WHERE member_id='{member}' AND is_public IS FALSE AND public_consent_at IS NULL")=='4'
    run(f"UPDATE public.waddles SET is_public=true,public_consent_at=now() WHERE id='{row_id(1)}'",role='service_role',sqlstate='PT403')
    http('read-erasure-hidden')
    clear(digest,keys,sqlstate='PT409')
    clear(digest,keys[:-1],sqlstate='PT409')
    run(same_receipt,sqlstate='PT409')
    checks.append('Preparation disables real feed and audio access before touching files. Missing readback or existing Storage records keep the request pending.')

    run(f"BEGIN; INSERT INTO storage.objects(id,bucket_id,name) VALUES(130,'waddles','{wrong_owner}'); "
        + statement('preview_waddle_erasure',ORIGIN),sqlstate='PT409')
    assert preview()==storage
    run("BEGIN; UPDATE storage.objects SET id=131 WHERE id=100; " + statement('preview_waddle_erasure',ORIGIN),sqlstate='PT409')
    assert preview()==storage
    checks.append('A new orphan or replacement Storage record after preparation prevents using the earlier manifest.')

    # Separate byte store and provider-catalog fixture. SQL writes below emulate
    # the provider's catalog updates. Real object removal uses the Storage API.
    objects = temp/'fixture-object-bytes'
    objects.mkdir()
    def path(key):
        return objects/sha256(key.encode()).hexdigest()
    for key in [legacy,current,orphan,missing,retained]:
        path(key).write_bytes(('isolated fixture '+key).encode())
    path(legacy).unlink()
    run("DELETE FROM storage.objects WHERE id=100")
    assert prepare(digest)==prepared
    assert preview()['remainingCatalogKeys']==[current,orphan]
    clear(digest,keys,sqlstate='PT409')
    # A lost provider reply can be checked without resending an operation.
    for key in [current,orphan]:
        path(key).unlink()
    run('DELETE FROM storage.objects WHERE id IN (101,102)')
    assert preview()['remainingCatalogKeys']==[]
    absent = [key for key in keys if not path(key).exists()]
    assert absent==keys[:-1]
    clear(digest,absent,sqlstate='PT409')
    # Independent provider support for the unlisted legacy key is represented
    # by removing its isolated byte leaf before checking the exact scope again.
    path(missing).unlink()
    absent = [key for key in keys if not path(key).exists()]
    assert absent==keys
    assert path(retained).read_bytes()==('isolated fixture '+retained).encode()
    clear(digest,keys[:-1],sqlstate='PT409')
    cleared = clear(digest,absent)
    assert clear(digest,absent)==cleared
    assert prepare(digest)==prepared
    assert preview()['phase']=='cleared'
    run(statement('preview_waddle_erasure','https://wrong-project.invalid'),sqlstate='PT409')
    assert run(f"SELECT pending_scope IS NULL FROM {SCHEMA}.waddle_erasure_receipts WHERE request_id='{request}'")=='t'
    assert run(f"SELECT count(*) FROM public.waddles WHERE id IN ('{row_id(4)}','{row_id(5)}')")=='2'
    assert run(same_receipt)==verified_before
    run(f"BEGIN; INSERT INTO storage.objects(id,bucket_id,name) VALUES(141,'waddles','{legacy}'); "
        + same_receipt,sqlstate='PT409')
    assert clear(digest,absent)==cleared
    assert run(public_receipt,role='service_role')==pending
    checks.append('Exact byte readback and an empty catalog allow one clear. Retries reuse its time, and the private manifest loses raw keys.')

    # Start a different wallet-only request while a real writer holds the
    # shared account lock. The committed post belongs to the later review.
    wallet_member, wallet_request = row_id(50), row_id(51)
    pending_key = wallet_member+'/1793960000060.webm'
    run(f"INSERT INTO public.members(id,display_name,wallet_address) VALUES "
        f"('{wallet_member}','Synthetic active wallet','0x0000000000000000000000000000000000000060')")
    run(f"INSERT INTO storage.objects(id,bucket_id,name) VALUES(150,'waddles','{pending_key}')")
    assert run(f"SELECT id FROM public.soe_account_deletion_request('wallet','{wallet_member}',"
               f"'{wallet_request}','{'6'*64}',4)",role='service_role')==wallet_request
    wallet_binding = (wallet_request,wallet_member,None)
    writer_sql = service_insert(wallet_member,pending_key,52)
    session = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))
    args = [str(kit['BIN']/'psql'),*map(str,staged.psql(database))]
    with subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, env=kit['ENV']) as writer:
        try:
            session['send'](writer,'SET ROLE service_role; BEGIN; '+writer_sql+' RETURNING id;')
            assert session['read_ready'](writer)==row_id(52)
            with subprocess.Popen([*args,'-c','SET ROLE postgres; '+statement('start_erasure',binding=wallet_binding)],
                                  stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,
                                  env={**kit['ENV'],'PGAPPNAME':'soe_waddle_erasure_starter'}) as starter:
                try:
                    deadline = time.monotonic()+2
                    while run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE "
                              "application_name='soe_waddle_erasure_starter' AND wait_event_type='Lock')")!='t':
                        assert starter.poll() is None and time.monotonic()<deadline, 'Erasure start must wait for the writer'
                        time.sleep(0.03)
                    session['send'](writer,'COMMIT;\n\\q')
                    _, error = writer.communicate(timeout=5)
                    assert writer.returncode==0,error
                    started, error = starter.communicate(timeout=5)
                    assert starter.returncode==0 and started.strip(),error
                finally:
                    session['terminate'](starter)
        finally:
            session['terminate'](writer)
    run(service_insert(wallet_member,pending_key,53),role='service_role',sqlstate='PT403')
    for phase in ('private_data','circle_posts','contact_data','circle_departure'):
        reviewed = json.loads(run(statement('preview_'+phase,binding=wallet_binding)))
        approved = (reviewed,) if phase=='private_data' else (reviewed,True)
        run(statement('erase_'+phase,*approved,binding=wallet_binding))
    reviewed_twiddle = json.loads(run(statement('preview_twiddle_erasure',binding=wallet_binding)))
    run(statement('erase_twiddle_data',reviewed_twiddle,True,binding=wallet_binding))
    wallet_identity = statement('preview_identity_removal',binding=wallet_binding)
    run(wallet_identity,sqlstate='PT409')
    wallet_preview = statement('preview_waddle_erasure',ORIGIN,binding=wallet_binding)
    wallet_scope = json.loads(run(wallet_preview))
    assert wallet_scope['keys']==[pending_key] and wallet_scope['rowCount']==1
    run(statement('prepare_waddle_erasure',ORIGIN,wallet_scope['scopeDigest'],True,binding=wallet_binding))
    wallet_pending = run(wallet_preview)
    path(pending_key).write_bytes(b'Pending wallet fixture audio')
    checks.append('A wallet-only request waits for an admitted publication, includes that exact post, and fences the next write.')

    archived = temp/'waddle-erasure.dump'
    partial = temp/'waddle-erasure-omitted.dump'
    reference = temp/'waddle-erasure-reference.json'
    earlier = temp/'waddle-erasure-earlier.json'
    restored, omitted = 'soe_waddle_erasure_restored', 'soe_waddle_erasure_omitted'
    with harness['export_snapshot'](staged,kit,database=database) as snapshot:
        capture = (*staged.psql(database),'-c',f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                   '-f',harness['REFERENCE'],'-c','ROLLBACK;')
        reference.write_text(kit['run']('psql','-v','soe_restore_include_waddle_erasure=on',*capture)+'\n')
        earlier.write_text(kit['run']('psql','-v','soe_restore_include_account_deletion_state=on',
                                     '-v','soe_restore_include_voice_archive=on',*capture)+'\n')
        dump = (*staged.connection(),'--format=custom','--snapshot',snapshot,'-d',database)
        kit['run']('pg_dump',*dump,'--file',archived)
        kit['run']('pg_dump',*dump,'--file',partial,f'--exclude-table-data={SCHEMA}.waddle_erasure_receipts')
    original.restore(restored,archived)
    original.restore(omitted,partial)
    old_match = harness['verify'](earlier,original,kit,database=omitted,include_account_deletion=True,include_voice_archive=True)
    match = harness['verify'](reference,original,kit,database=restored,include_waddle_erasure=True)
    mismatch = harness['verify'](reference,original,kit,database=omitted,include_waddle_erasure=True)
    assert old_match['status']=='MATCH' and old_match['tablesCompared']==64
    assert match['status']=='MATCH' and match['tablesCompared']==65
    assert mismatch=={**match,'status':'MISMATCH','rowsDiffer':[SCHEMA+'.waddle_erasure_receipts']},mismatch
    assert clear(digest,absent,cluster=original,db=restored)==cleared
    assert run(same_receipt,cluster=original,db=restored)==verified_before
    assert run(public_receipt,role='service_role',cluster=original,db=restored)==pending
    assert run(wallet_preview,cluster=original,db=restored)==wallet_pending
    run(same_receipt,cluster=original,db=omitted,sqlstate='PT409')
    http('read-erasure-restored',original,restored)
    run(wallet_identity,cluster=original,db=restored,sqlstate='PT409')
    path(pending_key).unlink()
    run('DELETE FROM storage.objects WHERE id=150',cluster=original,db=restored)
    clear(wallet_scope['scopeDigest'],[pending_key],binding=wallet_binding,cluster=original,db=restored)
    identity_review = json.loads(run(wallet_identity,cluster=original,db=restored))
    assert identity_review['phase']=='review' and identity_review['hasWallet'] and not identity_review['hasProvider']
    run(statement('prepare_identity_removal',identity_review,True,binding=wallet_binding),cluster=original,db=restored)
    assert run(statement('verify_identity_removal',binding=wallet_binding),cluster=original,db=restored)
    checks.append('The wallet-only request finishes voice erasure after recovery, then unlinks and verifies the wallet in the current identity workflow.')
    report['waddleRestore'] = {'previousFormatOmission':old_match,'partialRestore':mismatch,'completeRestore':match}
    checks.append('The 65-table check detects an archive that loses the prepared and cleared receipts. The full restore preserves exact retry and the pending file list.')


def main():
    os.umask(0o077)
    twiddle = runpy.run_path(str(SCRIPT.with_name('rehearse-twiddle-erasure.py')))
    identity = runpy.run_path(str(SCRIPT.with_name('rehearse-identity-removal.py')))
    previous = runpy.run_path(str(SCRIPT.with_name('rehearse-circle-departure.py')))
    contact = runpy.run_path(str(SCRIPT.with_name('rehearse-contact-erasure.py')))
    drafts = [*contact['DRAFTS'], ROOT/'docs/sql/account-erasure-circle-relationships-apply.sql']
    release = runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL','CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    report = {'checks': [], 'providerSdk': [], 'closedRoleOperations': 0, 'waddleChecks': [],
              'waddleHttp': [], 'productionRestoreVerified': False}
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
            twiddle['exercise'](staged,original,database,owner,temp,release,harness,kit,previous,identity,drafts,report)
            exercise(original,staged,database,owner,temp,release,harness,kit,checker,previous,report)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    report.update(status='PASS',clustersStopped=True,temporaryDirectoryRemoved=True,
                  draftSha256=kit['digest'](DRAFT))
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
