"""Prove Waddle table containment and the HTTP boundary on an isolated restore."""
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT / 'docs/sql/waddle-data-containment-apply.sql'
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
        finally:
            cluster.stop()
    report.update(status='PASS',clusterStopped=True,temporaryDirectoryRemoved=True,draftSha256=kit['digest'](DRAFT))
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
