"""Verify the Gutenberg passage boundary on a disposable full release restore."""
from pathlib import Path
import json
import re
import runpy

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT / 'docs/sql/circle-indexed-passage-guard-apply.sql'
FUNCTION = 'public._soe_circle_passage_reference_valid(jsonb)'


def exercise(original, staged, database, temp, release, harness, kit, checker, report):
    checks = report['indexedPassageChecks'] = []
    owner = kit['OWNER']

    def query(sql, *, role='postgres', code=None, cluster=staged, db=database):
        return cluster.query(db, f'SET ROLE {role};\n' + sql, owner, sqlstate=code)

    def apply(code=None):
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', DRAFT, sqlstate=code)

    refs = {}
    for line in query('SELECT to_jsonb(e) FROM public._soe_circle_reading_editions() e', role='service_role').splitlines():
        edition = json.loads(line)
        refs[edition['book_id']] = {'version': 1, 'bookId': edition['book_id'], 'editionId': edition['edition_id'],
                                   'blockIndex': 0, 'start': None, 'end': None}

    def validate(ref, **scope):
        return query('SELECT public._soe_circle_passage_reference_valid(' + release['literal'](ref) + ')',
                     role='service_role', **scope)

    assert validate(refs['luke-good-samaritan']) == 't'
    query(f'GRANT EXECUTE ON FUNCTION {FUNCTION} TO authenticated')
    apply('PT409')
    assert validate(refs['luke-good-samaritan']) == 't'
    query(f'REVOKE EXECUTE ON FUNCTION {FUNCTION} FROM authenticated')
    apply()
    apply()
    report['orderedMigrationFiles'].append(str(DRAFT.relative_to(ROOT)))
    report['indexedPassageDraftSha256'] = kit['digest'](DRAFT)
    checks.append('The guard detects a browser grant, refuses to apply under drift, and supports exact reapplication.')

    for book, reference in refs.items():
        accepted = reference['editionId'].startswith('pg-')
        assert validate(reference) == ('t' if accepted else 'f'), book
        assert validate({**reference, 'start': 0, 'end': 12}) == ('t' if accepted else 'f'), book
        assert validate({**reference, 'blockIndex': 100000}) == 'f'
        assert validate({**reference, 'editionId': reference['editionId'] + '0'}) == 'f'
    assert len(refs) == 10
    for role in ('anon', 'authenticated'):
        query('SELECT public._soe_circle_passage_reference_valid(NULL)', role=role, code='42501')
    checks.append('All eight indexed books retain link and quote validation. Both Scripture studies, wrong editions and invalid blocks are refused.')

    archive, reference = temp / 'passage-guard.dump', temp / 'passage-guard-reference.json'
    restored = 'soe_indexed_passage_restored'
    with harness['export_snapshot'](staged, kit, database=database) as snapshot:
        reference.write_text(kit['run']('psql', '-v', 'soe_restore_include_member_block_erasure=on', *staged.psql(database),
                                       '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                                       '-f', harness['REFERENCE'], '-c', 'ROLLBACK;') + '\n')
        kit['run']('pg_dump', *staged.connection(), '--format=custom', '--snapshot', snapshot, '-d', database, '--file', archive)
    original.restore(restored, archive)
    match = harness['verify'](reference, original, kit, database=restored, include_member_block_erasure=True)
    assert match['status'] == 'MATCH' and match['tablesCompared'] == 67, match
    target = {'cluster': original, 'db': restored}
    assert validate(refs['luke-good-samaritan'], **target) == 'f'
    old = re.search(r'CREATE FUNCTION public\._soe_circle_passage_reference_valid\(p_reference jsonb\).*?\$\$;',
                    (ROOT / 'docs/sql/circle-passage-posts.sql').read_text(), re.S)[0]
    query(old.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1), **target)
    assert validate(refs['luke-good-samaritan'], **target) == 't'
    stale = harness['verify'](reference, original, kit, database=restored, include_member_block_erasure=True)
    assert stale['status'] == 'MISMATCH' and not stale['circleRoutinesMatch'], stale
    report['indexedPassageRestore'] = {'complete': match, 'previousValidator': stale}
    checks.append('The restored database preserves the passage guard and detects replacement by the earlier validator.')


def complete_chain(*args):
    runpy.run_path(str(SCRIPT.with_name('rehearse-good-samaritan-edition.py')))['complete_chain'](*args)
    exercise(*args)


if __name__ == '__main__':
    runpy.run_path(str(SCRIPT.with_name('rehearse-direct-message-blocks.py')))['main'](complete_chain)
