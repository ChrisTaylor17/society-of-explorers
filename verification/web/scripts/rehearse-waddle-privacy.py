"""Prove Waddle table containment and the HTTP boundary on an isolated restore."""
from hashlib import sha256
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT / 'docs/sql/waddle-data-containment-apply.sql'
STORAGE_INVENTORY = ROOT / 'docs/sql/voice-storage-inventory.sql'
STORAGE_CHECK = SCRIPT.with_name('verify-voice-storage.py')
AUTHOR = '77000000-0000-4000-8000-000000000001'
OTHER = '77000000-0000-4000-8000-000000000002'

FIXTURE = f"""
CREATE TABLE public.waddles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid, audio_url text, transcription text,
  thinker_id text, thinker_reaction text, is_public boolean, nft_token_id text, created_at timestamptz DEFAULT now()
);
GRANT ALL ON public.waddles TO anon,authenticated,service_role;
GRANT SELECT(transcription) ON public.waddles TO PUBLIC;
GRANT UPDATE(transcription) ON public.waddles TO anon;
INSERT INTO public.waddles(member_id,audio_url,transcription,is_public,nft_token_id,created_at) VALUES
  ('{AUTHOR}','https://waddle-fixture.invalid/storage/v1/object/public/waddles/{AUTHOR}/1793960000000.webm',
   'Synthetic public recording',true,'INTERNAL_FIXTURE_TOKEN','2026-11-06 10:00:00Z'),
  ('{AUTHOR}','https://unrelated.invalid/foreign.webm','Synthetic public external link',true,NULL,'2026-11-06 10:01:00Z'),
  ('{AUTHOR}','https://waddle-fixture.invalid/storage/v1/object/public/waddles/x%2Fy.webm',
   'Synthetic public escaped path',true,NULL,'2026-11-06 10:02:00Z'),
  ('{AUTHOR}','https://waddle-fixture.invalid/storage/v1/object/public/waddles/{OTHER}/1793960000001.webm',
   'Synthetic public other owner',true,NULL,'2026-11-06 10:02:30Z'),
  ('{AUTHOR}','{AUTHOR}/1793960000001.wav','Synthetic archived Twiddle audio',true,NULL,'2026-11-06 10:02:45Z'),
  ('{AUTHOR}','{AUTHOR}/1793960000001.webm',
   'SYNTHETIC_PRIVATE_WADDLE',false,NULL,'2026-11-06 10:03:00Z'),
  (NULL,NULL,'SYNTHETIC_UNMARKED_WADDLE',NULL,NULL,'2026-11-06 10:04:00Z'),
  ('{AUTHOR}','{AUTHOR}/1793960000002.webm','SYNTHETIC_PUBLIC_UNREVIEWED',true,NULL,'2026-11-06 10:05:00Z');
"""


def exercise(cluster, temp, kit, report):
    owner = kit['OWNER']
    source, target, restored = 'soe_waddle_source', 'soe_waddle_stage', 'soe_waddle_restored'
    checks = report['checks']

    def query(db, sql, role='postgres', sqlstate=None):
        return cluster.query(db, f'SET ROLE {role}; ' + sql, owner, sqlstate=sqlstate)

    def apply(sqlstate=None):
        kit['run']('psql', *cluster.psql(target), '-c', 'SET ROLE postgres', '-f', DRAFT, sqlstate=sqlstate)

    def rows(db, include_consent=False):
        projection = 'to_jsonb(w)' if include_consent else "to_jsonb(w)-'public_consent_at'"
        return query(db, f'SELECT jsonb_agg({projection} ORDER BY id) FROM public.waddles w')

    def http(db, mode):
        result = subprocess.run([
            '/opt/homebrew/bin/node', '--require', './scripts/deny-build-network.cjs',
            './tests/support/waddle-privacy-http.mjs', str(kit['BIN'] / 'psql'), str(cluster.socket),
            kit['PORT'], db, owner, AUTHOR, mode,
        ], cwd=ROOT/'verification/web', env=kit['ENV'], capture_output=True, text=True, timeout=20)
        assert result.returncode == 0, result.stderr[-2600:]
        report['http'].append(json.loads(result.stdout))

    cluster.query('postgres','CREATE ROLE postgres; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
    cluster.query('postgres',f'CREATE DATABASE {source}')
    cluster.query(source,'GRANT CREATE ON SCHEMA public TO postgres')
    query(source,FIXTURE)
    before = rows(source)
    raw = temp/'raw.dump'
    cluster.dump(source,raw)
    cluster.restore(target,raw)
    assert rows(target) == before
    for role in ('anon','authenticated'):
        assert query(target,'SELECT transcription FROM public.waddles WHERE is_public IS FALSE',role) == 'SYNTHETIC_PRIVATE_WADDLE'
        assert query(target,"BEGIN; UPDATE public.waddles SET is_public=true WHERE is_public IS FALSE RETURNING id; ROLLBACK",role)
    checks.append('The hosted-shape fixture reproduces unauthorized reads and public-flag changes after restore.')

    query(target,'CREATE VIEW public.fixture_waddle_view AS SELECT transcription FROM public.waddles')
    apply(sqlstate='PT409')
    query(target,'DROP VIEW public.fixture_waddle_view')
    assert query(target,'SELECT count(*) FROM public.waddles',role='anon') == '8'
    apply()
    apply()
    assert rows(target) == before
    assert query(target,"SELECT relrowsecurity FROM pg_class WHERE oid='public.waddles'::regclass") == 't'
    for role in ('anon','authenticated'):
        for sql in ('SELECT transcription FROM public.waddles','UPDATE public.waddles SET is_public=true',
                    'UPDATE public.waddles SET public_consent_at=now()','DELETE FROM public.waddles',
                    'INSERT INTO public.waddles(id) VALUES(gen_random_uuid())',
                    'TRUNCATE public.waddles'):
            query(target,sql,role,sqlstate='42501')
            report['browserDenials'] += 1
    checks.append('Unknown dependencies stop apply. The reviewed draft closes table and column access and preserves all rows.')

    assert query(target,'SELECT count(*) FROM public.waddles WHERE public_consent_at IS NOT NULL') == '0'
    http(target,'read-before-review')
    query(target,"UPDATE public.waddles SET public_consent_at='2026-11-06T10:06:00Z' "
          "WHERE transcription IN ('Synthetic public recording','Synthetic public external link',"
          "'Synthetic public escaped path','Synthetic public other owner','Synthetic archived Twiddle audio',"
          "'SYNTHETIC_PRIVATE_WADDLE')")
    http(target,'write-and-read')
    assert query(target,f"SELECT count(*) FROM public.waddles WHERE member_id='{AUTHOR}'",role='service_role') == '9'
    checks.append('Existing flags supply no publication consent. The actual route returns only consented rows and writes only after exact account checks.')
    sealed = temp/'sealed.dump'
    cluster.dump(target,sealed)
    cluster.restore(restored,sealed)
    assert rows(restored,include_consent=True) == rows(target,include_consent=True)
    query(restored,'SELECT audio_url FROM public.waddles',role='anon',sqlstate='42501')
    http(restored,'read-restored')
    checks.append('A second restore preserves the contained table and the public feed through the actual route.')


def exercise_storage(cluster, temp, kit, report):
    original, restored = 'soe_voice_media_source', 'soe_voice_media_restored'
    source, target = (temp / name for name in ('source-media', 'restored-media'))
    for directory in (source, target):
        (directory/'objects').mkdir(mode=0o700, parents=True)
    reference = temp/'voice-reference.json'
    webm_key = f'{AUTHOR}/1793960000000.webm'
    object_bytes = {
        webm_key: b'\x1a\x45\xdf\xa3' + b'SYNTHETIC_WEBM',
        f'{OTHER}/1793960000001.wav': b'RIFF-SYNTHETIC_WAV',
        'archive/../untrusted-fixture-name.bin': b'SYNTHETIC_UNREFERENCED',
        'old/.emptyFolderPlaceholder': b'',
    }

    def leaf(key):
        return sha256(key.encode()).hexdigest() + '.blob'

    cluster.query('postgres',f'CREATE DATABASE {original}')
    cluster.query(original,"""
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint,
        allowed_mime_types text[], versioning_status text DEFAULT 'DISABLED');
      CREATE TABLE storage.objects(bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL,
        metadata jsonb, archived_at timestamptz, is_versioned boolean DEFAULT false, is_delete_marker boolean DEFAULT false,
        PRIMARY KEY(bucket_id,name));
      INSERT INTO storage.buckets(id,public) VALUES ('waddles',true),('other-fixture-bucket',false);
      INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('other-fixture-bucket','not-in-scope',NULL);
    """)
    for key, data in object_bytes.items():
        mime = 'audio/webm;codecs=opus' if key.endswith('.webm') else 'audio/wav' if key.endswith('.wav') else 'application/octet-stream'
        size_field = 'contentLength' if key.endswith('.wav') else 'size'
        metadata = json.dumps({size_field: len(data), 'mimetype': mime})
        cluster.query(original,"INSERT INTO storage.objects(bucket_id,name,metadata) "
                      f"VALUES ('waddles','{key}','{metadata}')")
        (source/'objects'/leaf(key)).write_bytes(data)

    def capture(database, directory):
        inventory = kit['run']('psql', *cluster.psql(database),
                               '-c', 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
                               '-f', STORAGE_INVENTORY, '-c', 'ROLLBACK;')
        (directory/'inventory.json').write_text(inventory+'\n')
        return json.loads(inventory)

    def check(mode, directory, status, **expected):
        result = subprocess.run([sys.executable,'-B',str(STORAGE_CHECK),mode,'--inventory',str(directory/'inventory.json'),
                                 '--objects',str(directory/'objects'),'--reference',str(reference)],
                                env=kit['ENV'],capture_output=True,text=True,timeout=15)
        assert not result.stderr and not any(key in result.stdout for key in object_bytes)
        assert not any(leaf(key) in result.stdout for key in object_bytes)
        value = json.loads(result.stdout)
        assert result.returncode == (0 if status in ('SEALED','MATCH') else 1)
        assert value['status']==status and value['productionCleared'] is False, value
        assert all(value[key]==item for key,item in expected.items()), value
        return value

    kit['run']('psql', *cluster.psql(original), '-c', 'BEGIN;', '-f', STORAGE_INVENTORY, sqlstate='P0001')
    inventory = capture(original,source)
    assert inventory['bucket']['public'] and len(inventory['objects']) == len(object_bytes)
    sealed = check('seal',source,'SEALED',objectsVerified=len(object_bytes))
    assert reference.stat().st_mode & 0o777 == 0o600
    saved = reference.read_bytes()
    check('seal',source,'UNAVAILABLE')
    assert reference.read_bytes()==saved
    archive = temp/'storage-catalog-only.dump'
    cluster.dump(original,archive)
    cluster.restore(restored,archive)
    # Simulate isolated bucket visibility configuration. Hosted changes go through the Storage API.
    cluster.query(restored,"UPDATE storage.buckets SET public=false WHERE id='waddles'")
    capture(restored,target)
    metadata_only = check('check',target,'MISMATCH',missingFiles=len(object_bytes),missingObjects=0)

    for key in object_bytes:
        (target/'objects'/leaf(key)).write_bytes((source/'objects'/leaf(key)).read_bytes())
    matched = check('check',target,'MATCH',objectsCompared=len(object_bytes))
    recording = target/'objects'/leaf(webm_key)
    corrupted = bytes([object_bytes[webm_key][0] ^ 1]) + object_bytes[webm_key][1:]
    recording.write_bytes(corrupted)
    check('check',target,'MISMATCH',changedContent=1,wrongFileLengths=0)
    recording.write_bytes(corrupted[:-1])
    check('check',target,'MISMATCH',wrongFileLengths=1)
    recording.unlink()
    recording.symlink_to(source/'objects'/leaf(webm_key))
    check('check',target,'UNAVAILABLE')
    recording.unlink()
    recording.write_bytes(object_bytes[webm_key])
    recording.chmod(0o644)
    check('check',target,'UNAVAILABLE')
    recording.chmod(0o600)

    cluster.query(restored,"UPDATE storage.buckets SET public=true WHERE id='waddles'")
    capture(restored,target)
    check('check',target,'MISMATCH',restoredBucketPublic=True)
    cluster.query(restored,"UPDATE storage.buckets SET public=false,file_size_limit=100 WHERE id='waddles'")
    capture(restored,target)
    check('check',target,'MISMATCH',bucketSettingsChanged=True)
    cluster.query(restored,"UPDATE storage.buckets SET file_size_limit=NULL WHERE id='waddles'")
    cluster.query(restored,f"UPDATE storage.objects SET metadata=metadata||'{{\"mimetype\":\"text/html\"}}' WHERE name='{webm_key}'")
    capture(restored,target)
    check('check',target,'MISMATCH',changedMetadata=1,changedContent=0)
    cluster.query(restored,"UPDATE storage.buckets SET versioning_status='SUSPENDED' WHERE id='waddles'")
    capture(restored,target)
    check('check',target,'UNAVAILABLE')
    cluster.query(restored,"ALTER TABLE storage.buckets DROP COLUMN versioning_status")
    cluster.query(restored,f"UPDATE storage.objects SET is_versioned=true WHERE name='{webm_key}'")
    capture(restored,target)
    check('check',target,'UNAVAILABLE')
    cluster.query(restored,f"DELETE FROM storage.objects WHERE name='{webm_key}'")
    capture(restored,target)
    check('check',target,'MISMATCH',missingObjects=1,unexpectedFiles=1)
    recording.unlink()
    check('check',target,'MISMATCH',missingObjects=1,unexpectedFiles=0)
    report['mediaRestore'] = {
        'sourceSeal':sealed,'metadataOnlyRestore':metadata_only,'byteCompletePrivateRestore':matched,
        'checks': [
            'The bucket inventory excludes unrelated objects and refuses capture outside a read-only repeatable-read snapshot.',
            'The reference is owner-only, remains unchanged on a second seal, and includes the zero-byte and unreferenced objects.',
            'Restored catalog rows with no object bytes fail the comparison. The private byte-complete readback matches.',
            'Same-size corruption, truncation, a symlink, and a non-private file are refused.',
            'Public visibility, bucket settings drift, content type changes, version history and a missing object are refused.',
        ],
    }


def main():
    os.umask(0o077)
    kit = runpy.run_path(str(SCRIPT.with_name('rehearse-native-core-restore.py')))
    report = {'checks': [], 'http': [], 'browserDenials': 0, 'hostedChanges': False}
    with TemporaryDirectory(prefix='soe-waddle-privacy-',dir='/private/tmp') as directory:
        temp = Path(directory)
        cluster = kit['Cluster'](temp/'db',kit['OWNER'])
        try:
            cluster.start()
            exercise(cluster,temp,kit,report)
            exercise_storage(cluster,temp,kit,report)
        finally:
            cluster.stop()
    report.update(status='PASS',clusterStopped=True,temporaryDirectoryRemoved=True,draftSha256=kit['digest'](DRAFT),
                  inventorySha256=kit['digest'](STORAGE_INVENTORY), storageVerifierSha256=kit['digest'](STORAGE_CHECK))
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
