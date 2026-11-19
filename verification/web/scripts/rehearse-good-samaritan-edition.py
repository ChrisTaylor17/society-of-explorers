"""Pin the reviewed Scripture edition on the full disposable release restore."""
from hashlib import sha256
import json
from pathlib import Path
import re
import runpy

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT / 'docs/sql/circle-luke-good-samaritan-edition-apply.sql'
SOURCE = ROOT / 'content/root-kernel/luke-good-samaritan.web-classic.json'
BOOK = 'luke-good-samaritan'
MEMBER = '77000000-0000-4000-8000-000000000301'


def exercise(original, staged, database, temp, release, harness, kit, checker, report):
    checks = report['lukeEditionChecks'] = []
    owner = kit['OWNER']
    source = json.loads(SOURCE.read_text())
    pin = sha256(json.dumps(source, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    selection = {'version': 1, 'bookId': BOOK, 'editionId': 'web-classic-' + pin, 'sessions': [{'from': 0, 'to': 0}]}
    signature = 'public._soe_circle_reading_editions()'
    old_catalog = re.search(r'CREATE FUNCTION public\._soe_circle_reading_editions\(\).*?\$\$;',
                            (ROOT / 'docs/sql/circle-reading-programs.sql').read_text(), re.S)[0]
    catalog = 'SELECT to_jsonb(e) FROM ' + signature + ' e ORDER BY book_id'

    def query(sql, *, role='postgres', code=None, cluster=staged, db=database):
        return cluster.query(db, f'SET ROLE {role};\n' + sql, owner, sqlstate=code)

    def call(function, *values):
        return f"SELECT public.{function}({','.join(map(release['literal'], values))})"

    def apply(code=None):
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', DRAFT, sqlstate=code)

    previous = query(catalog, role='service_role').splitlines()
    assert len(previous) == 9
    assert query(call('_soe_circle_reading_program_valid', selection), role='service_role') == 'f'
    query(f'GRANT EXECUTE ON FUNCTION {signature} TO authenticated')
    apply('PT409')
    assert query(catalog, role='service_role').splitlines() == previous
    query(f'REVOKE EXECUTE ON FUNCTION {signature} FROM authenticated')
    apply()
    report['orderedMigrationFiles'].append(str(DRAFT.relative_to(ROOT)))
    report['lukeEditionDraftSha256'] = kit['digest'](DRAFT)
    installed = query(catalog, role='service_role').splitlines()
    assert len(installed) == 10 and all(row in installed for row in previous)
    assert [json.loads(row) for row in installed if row not in previous] == [
        {'book_id': BOOK, 'edition_id': selection['editionId'], 'block_count': 1},
    ]
    apply()
    assert query(catalog, role='service_role').splitlines() == installed
    for role in ('anon', 'authenticated'):
        query(catalog, role=role, code='42501')
    checks.append('The owner draft refuses grant drift, preserves the nine prior pins, and admits only the exact new pin. Reapplying it is safe.')

    query(f"INSERT INTO public.members(id,display_name) VALUES ('{MEMBER}','Synthetic Scripture host')")
    day, weekday = query('SELECT CURRENT_DATE+1,extract(dow FROM CURRENT_DATE+1)::integer').split('|')
    payload = {'title': 'Synthetic Good Samaritan salon', 'description': None, 'format': 'online', 'city': None,
               'region': None, 'venueName': None, 'venueType': 'online', 'weekday': int(weekday), 'time': '19:00',
               'timezone': 'UTC', 'startDate': day, 'maxMembers': 8, 'onlineUrl': release['MEETING'], 'readingProgram': selection}
    create = 'soe_circle_create'
    key = '77000000-0000-4000-8000-000000000302'
    for invalid in ({**selection, 'editionId': selection['editionId'][:-1] + '0'},
                    {**selection, 'sessions': [{'from': 0, 'to': 1}]}):
        query(call(create, MEMBER, key, {**payload, 'readingProgram': invalid}), role='service_role', code='PT400')
    create_sql = call(create, MEMBER, key, payload)
    receipt = json.loads(query(create_sql, role='service_role'))
    assert receipt['replayed'] is False
    assert json.loads(query(create_sql, role='service_role')) == {**receipt, 'replayed': True}
    circle = receipt['circleId']
    assert query(f"SELECT count(*) FROM public.book_cohorts WHERE created_by='{MEMBER}'") == '1'
    detail = call('soe_circle_detail_profiles', MEMBER, circle)
    assert json.loads(query(detail, role='service_role'))['circle']['circle_reading_program'] == selection
    checks.append('The current creation and detail routines reject altered hashes and out-of-range positions and preserve the accepted assignment on exact retry.')

    archive = temp / 'luke-edition.dump'
    reference = temp / 'luke-edition-reference.json'
    restored = 'soe_luke_edition_restored'
    with harness['export_snapshot'](staged, kit, database=database) as snapshot:
        reference.write_text(kit['run']('psql', '-v', 'soe_restore_include_member_block_erasure=on', *staged.psql(database),
                                       '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                                       '-f', harness['REFERENCE'], '-c', 'ROLLBACK;') + '\n')
        kit['run']('pg_dump', *staged.connection(), '--format=custom', '--snapshot', snapshot, '-d', database, '--file', archive)
    original.restore(restored, archive)
    match = harness['verify'](reference, original, kit, database=restored, include_member_block_erasure=True)
    assert match['status'] == 'MATCH' and match['tablesCompared'] == 67, match
    target = {'cluster': original, 'db': restored}
    assert json.loads(query(detail, role='service_role', **target))['circle']['circle_reading_program'] == selection
    query(old_catalog.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1), **target)
    missing = harness['verify'](reference, original, kit, database=restored, include_member_block_erasure=True)
    assert missing['status'] == 'MISMATCH' and not missing['circleRoutinesMatch'], missing
    report['lukeEditionRestore'] = {'complete': match, 'previousCatalog': missing}
    checks.append('The 67-table backup restores the exact assignment and rejects the earlier catalog after a deliberate routine replacement.')


def complete_chain(*args):
    previous = runpy.run_path(str(SCRIPT.with_name('rehearse-member-block-erasure.py')))
    previous['complete_chain'](*args)
    exercise(*args)


if __name__ == '__main__':
    runpy.run_path(str(SCRIPT.with_name('rehearse-direct-message-blocks.py')))['main'](complete_chain)
