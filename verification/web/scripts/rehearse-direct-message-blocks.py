"""Rehearse contained DM cutover, pair-lock races and block recovery on PostgreSQL."""
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import time

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT/'docs/sql/direct-message-blocks-apply.sql'
CAROL = '7a000000-0000-4000-8000-000000000003'


def key(number):
    return f'7a000000-0000-4000-8000-{number:012d}'


def exercise(original, staged, database, temp, release, harness, kit, checker, report):
    alice, bob = key(1), key(2)
    owner = kit['OWNER']
    session = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))

    def run(sql, *, role='postgres', code=None, cluster=staged, db=database):
        return cluster.query(db, f'SET ROLE {role};\n'+sql, owner, sqlstate=code)

    def call(name, *params):
        return f"SELECT public.soe_direct_message_{name}("+','.join(map(release['literal'],params))+')'

    def saved(name, *params, **options):
        return json.loads(run(call(name,*params),role='service_role',**options))

    def block(actor,peer,request):
        return call('set_block',actor,peer,None,True,0,request)

    def race(first,second,expected=None):
        args = [str(kit['BIN']/'psql'),*map(str,staged.psql(database))]
        with subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, env=kit['ENV']) as holder:
            try:
                session['send'](holder,'SET ROLE service_role; BEGIN; '+first+';')
                result = json.loads(session['read_ready'](holder))
                assert result
                with subprocess.Popen([*args,'-c','SET ROLE service_role; '+second],
                                      stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,
                                      env={**kit['ENV'],'PGAPPNAME':'soe_dm_pair_contender'}) as contender:
                    try:
                        deadline=time.monotonic()+2
                        while run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE "
                                  "application_name='soe_dm_pair_contender' AND wait_event_type='Lock' AND wait_event='advisory')")!='t':
                            assert contender.poll() is None and time.monotonic()<deadline
                            time.sleep(0.03)
                        session['send'](holder,'COMMIT;\n\\q')
                        _, error = holder.communicate(timeout=5)
                        assert holder.returncode==0,error
                        output,error = contender.communicate(timeout=5)
                        if expected:
                            assert contender.returncode!=0 and f'ERROR:  {expected}:' in error,error
                            return result,None
                        assert contender.returncode==0,error
                        return result,json.loads(output)
                    finally:
                        session['terminate'](contender)
            finally:
                session['terminate'](holder)

    assert run("SELECT to_regclass('public.direct_messages') IS NOT NULL")=='t'
    run(f"INSERT INTO public.members(id,display_name) VALUES "
        f"('{alice}','Synthetic first DM member'),('{bob}','Synthetic second DM member'),('{CAROL}','Synthetic unrelated explorer')")
    run(f"""
      INSERT INTO public.direct_messages(id,sender_id,recipient_id,content,read) VALUES
        ('{key(10)}','{bob}','{alice}','Synthetic incoming direct message',false),
        ('{key(11)}','{alice}','{bob}','Synthetic outgoing direct message',false),
        ('{key(12)}','{CAROL}','{alice}','Synthetic separate direct message',false),
        ('{key(13)}',NULL,NULL,'Synthetic unattributed legacy row',NULL);
    """)
    fingerprint_sql = "SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(m) ORDER BY m.id)::text,'UTF8')),'hex') FROM public.direct_messages m"
    before = run(fingerprint_sql,role='service_role')
    kit['run']('psql',*staged.psql(database),'-c','SET ROLE postgres','-f',DRAFT)
    report['orderedMigrationFiles'].append(str(DRAFT.relative_to(ROOT)))
    assert run(fingerprint_sql)==before
    checks=report['blockChecks']
    checks.append('The RPC cutover keeps existing direct-message rows, including the legacy unattributed row.')

    denied = 0
    for role in ('anon','authenticated','service_role'):
        for sql in (fingerprint_sql,'SELECT * FROM soe_member_safety_private.member_blocks',
                    'UPDATE public.direct_messages SET read=true', 'DELETE FROM public.direct_messages'):
            run(sql,role=role,code='42501')
            denied+=1
    for role in ('anon','authenticated'):
        for sql in (call('read',alice,bob),call('blocks',alice,None),block(alice,bob,key(20))):
            run(sql,role=role,code='42501')
            denied+=1
    report['roleDenials']=denied
    assert saved('read',alice,bob)['contact']['canMessage']

    unread_before=saved('read',alice,None)['unreadCount']
    first,_=race(block(alice,bob,key(20)),call('send',bob,alice,'Synthetic late send'),'PT403')
    assert saved('set_block',alice,bob,None,True,0,key(20))==first
    assert saved('read',alice,bob)['messages']==[]
    blocked=saved('read',bob,alice)
    assert blocked=={'messages':[],'contact':{'blockId':None,'blockedByMe':False,'revision':0,'canMessage':False}}
    assert saved('read',alice,None)['unreadCount']==unread_before-1
    run(f"SELECT public.soe_direct_message_ack('{bob}','{alice}',ARRAY['{key(11)}']::uuid[])",
        role='service_role',code='PT403')
    assert run(fingerprint_sql)==before
    checks.append('A second PostgreSQL session waits on an uncommitted block and then refuses the held send. Both reads and unread counts reflect the block.')

    pending,opposite=race(call('send',alice,CAROL,'Synthetic message admitted before a block'),block(CAROL,alice,key(21)))
    assert pending=={'ok':True} and opposite['blockedByMe'] is True
    assert saved('read',alice,CAROL)['messages']==[]
    assert run("SELECT count(*) FROM public.direct_messages WHERE content='Synthetic message admitted before a block'")=='1'
    run('BEGIN ISOLATION LEVEL REPEATABLE READ; '+call('send',alice,bob,'Snapshot write'),role='service_role',code='PT400')
    checks.append('When a send locks first, the later block preserves that accepted row and hides it from both participants. Writes refuse a stale transaction snapshot.')

    second=saved('set_block',bob,alice,None,True,0,key(22))
    removed=saved('set_block',alice,None,first['blockId'],False,1,key(23))
    assert removed['revision']==2 and saved('set_block',alice,None,first['blockId'],False,1,key(23))==removed
    run(block(alice,bob,key(20)),role='service_role',code='PT409')
    assert saved('read',alice,bob)['contact']['canMessage'] is False
    assert saved('blocks',alice,None)=={'items':[],'nextCursor':None}
    assert saved('blocks',bob,None)['items'][0]['blockId']==second['blockId']
    checks.append('Unblocking only changes the caller’s block. Exact replay is safe, and the opposite active block still protects the conversation.')

    archive=temp/'direct-message-blocks.dump'
    partial=temp/'direct-message-blocks-omitted.dump'
    reference=temp/'direct-message-blocks-reference.json'
    earlier=temp/'direct-message-blocks-earlier.json'
    restored,omitted='soe_direct_message_blocks_restore','soe_direct_message_blocks_omitted'
    with harness['export_snapshot'](staged,kit,database=database) as snapshot:
        capture=(*staged.psql(database),'-c',f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                 '-f',harness['REFERENCE'],'-c','ROLLBACK;')
        reference.write_text(kit['run']('psql','-v','soe_restore_include_member_safety=on',*capture)+'\n')
        earlier.write_text(kit['run']('psql','-v','soe_restore_include_waddle_erasure=on',*capture)+'\n')
        dump=(*staged.connection(),'--format=custom','--snapshot',snapshot,'-d',database)
        kit['run']('pg_dump',*dump,'--file',archive)
        kit['run']('pg_dump',*dump,'--file',partial,'--exclude-table-data=soe_member_safety_private.member_blocks')
    assert len(checker['decode_reference'](reference.read_bytes(),checker['MEMBER_SAFETY_FORMAT'])['tables'])==66
    original.restore(restored,archive)
    original.restore(omitted,partial)
    old_match=harness['verify'](earlier,original,kit,database=omitted,include_waddle_erasure=True)
    match=harness['verify'](reference,original,kit,database=restored,include_member_safety=True)
    mismatch=harness['verify'](reference,original,kit,database=omitted,include_member_safety=True)
    assert old_match['status']=='MATCH' and old_match['tablesCompared']==65
    assert match['status']=='MATCH' and match['tablesCompared']==66,match
    assert mismatch=={**match,'status':'MISMATCH','rowsDiffer':['soe_member_safety_private.member_blocks']},mismatch
    assert saved('read',alice,bob,cluster=original,db=omitted)['contact']['canMessage']
    report['memberSafetyRestore']={'previousFormatOmission':old_match,'partialRestore':mismatch,'completeRestore':match}
    restored_options={'cluster':original,'db':restored}
    assert saved('blocks',bob,None,**restored_options)==saved('blocks',bob,None)
    assert saved('read',alice,bob,**restored_options)['messages']==[]
    assert saved('set_block',alice,None,first['blockId'],False,1,key(23),**restored_options)==removed
    run(fingerprint_sql,role='service_role',code='42501',**restored_options)
    saved('set_block',bob,None,second['blockId'],False,1,key(24),**restored_options)
    restored_thread=saved('read',alice,bob,**restored_options)
    assert restored_thread['contact']['canMessage'] and {key(10),key(11)}.issubset({m['id'] for m in restored_thread['messages']})
    checks.append('The isolated restore preserves private blocks, old history, exact retry and the raw-table access denial.')


def main():
    os.umask(0o077)
    release=runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness=runpy.run_path(str(release['RESTORE_TEST']))
    kit,checker=(runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL','CHECKER'))
    twiddle=runpy.run_path(str(SCRIPT.with_name('rehearse-twiddle-erasure.py')))
    identity=runpy.run_path(str(SCRIPT.with_name('rehearse-identity-removal.py')))
    previous=runpy.run_path(str(SCRIPT.with_name('rehearse-circle-departure.py')))
    contact=runpy.run_path(str(SCRIPT.with_name('rehearse-contact-erasure.py')))
    waddle=runpy.run_path(str(SCRIPT.with_name('rehearse-waddle-erasure.py')))
    drafts=[*contact['DRAFTS'],ROOT/'docs/sql/account-erasure-circle-relationships-apply.sql']
    report={'blockChecks':[],'checks':[],'productionCleared':False,'providerSdk':[],
            'closedRoleOperations':0,'waddleChecks':[],'waddleHttp':[]}
    with TemporaryDirectory(prefix='soe-circle-departure-',dir='/private/tmp') as directory:
        temp=Path(directory)
        original,staged=[kit['Cluster'](temp/name,kit['OWNER']) for name in ('original','staged')]
        try:
            subprocess.run(['/opt/homebrew/bin/node','--require',str(release['NETWORK_GUARD']),
                            str(release['EXPORT_FIXTURE']),str(temp)],env=kit['ENV'],cwd=ROOT,
                            check=True,timeout=20,stdout=subprocess.DEVNULL)
            report['fixture']=json.loads((temp/'inputs.json').read_bytes())
            original.start()
            staged.start()
            release['stage_restored_release'](original,staged,kit['SOURCE_DB'],temp,harness,kit,checker,report)
            twiddle['exercise'](staged,original,kit['SOURCE_DB'],kit['OWNER'],temp,release,harness,kit,previous,identity,drafts,report)
            waddle['exercise'](original,staged,kit['SOURCE_DB'],kit['OWNER'],temp,release,harness,kit,checker,previous,report)
            exercise(original,staged,kit['SOURCE_DB'],temp,release,harness,kit,checker,report)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    print(json.dumps({**report,'status':'PASS','clustersStopped':True,'draftSha256':kit['digest'](DRAFT)},indent=2))


if __name__=='__main__':
    main()
