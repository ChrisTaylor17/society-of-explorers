"""Compare an approved, locally restored database with a private export reference."""

import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess


ROOT = Path(__file__).resolve().parents[3]
REFERENCE_SQL = ROOT / 'docs/sql/privacy-restore-reference.sql'
DEFAULT_PSQL = Path('/opt/homebrew/opt/postgresql@17/bin/psql')
FORMAT = 'soe-privacy-restore-v1'
TABLES = frozenset({
    'members', 'reading_progress', 'book_highlights', 'great_books_progress',
    'great_books_highlights', 'book_reflections', 'thinker_memory', 'daily_questions',
    'matched_conversations', 'practice_reflections', 'question_responses',
})
PRINCIPALS = ['anon', 'authenticated', 'service_role']
MAX_REFERENCE_BYTES = 16384
BEGIN = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'
LOCAL_ONLY = """
DO $local_only$
BEGIN
  IF pg_catalog.inet_server_addr() IS NOT NULL OR pg_catalog.current_setting('listen_addresses') <> '' THEN
    RAISE EXCEPTION 'The restore target must only use local sockets.';
  END IF;
END;
$local_only$;
"""


class CheckError(Exception):
    """The message is a fixed diagnostic key safe for a release receipt."""


def unique_object(pairs):
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ValueError('Duplicate field')
    return result


def decode_reference(raw):
    if not raw or len(raw) > MAX_REFERENCE_BYTES:
        raise ValueError('Reference size')
    value = json.loads(raw, object_pairs_hook=unique_object)
    if (not isinstance(value, dict)
            or set(value) != {'format', 'serverMajor', 'principals', 'roles', 'tables'}
            or value['format'] != FORMAT or value['principals'] != PRINCIPALS
            or type(value['serverMajor']) is not int or value['serverMajor'] < 15
            or not valid_digest(value['roles'])
            or not isinstance(value['tables'], dict) or set(value['tables']) != TABLES):
        raise ValueError('Reference shape')
    for entry in value['tables'].values():
        if (not isinstance(entry, dict) or set(entry) != {'rows', 'data', 'definition'}
                or type(entry['rows']) is not int or not 0 <= entry['rows'] <= 2**63 - 1
                or not valid_digest(entry['data']) or not valid_digest(entry['definition'])):
            raise ValueError('Table evidence shape')
    return value


def valid_digest(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def read_private_reference(path):
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077
                    or not 0 < info.st_size <= MAX_REFERENCE_BYTES or not info.st_blocks):
                raise ValueError('Owner-only resident file required')
            return decode_reference(stream.read(MAX_REFERENCE_BYTES + 1))
    except (OSError, ValueError, RecursionError):
        raise CheckError('private_reference_invalid') from None


def safe_socket(directory, port):
    try:
        info = directory.lstat()
        # libpq also accepts comma-separated hosts. Only a literal directory
        # with an owned socket leaf may reach the PostgreSQL client.
        if (not directory.is_absolute() or directory != directory.resolve(strict=True)
                or any(char in str(directory) for char in ',\r\n')
                or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise ValueError('Unowned socket directory')
        socket = (directory / f'.s.PGSQL.{port}').lstat()
        if not stat.S_ISSOCK(socket.st_mode) or socket.st_uid != os.getuid():
            raise ValueError('Unowned socket')
    except (OSError, ValueError, RuntimeError):
        raise CheckError('private_socket_required') from None


def snapshot_sql():
    info = REFERENCE_SQL.lstat()
    if not stat.S_ISREG(info.st_mode) or not info.st_size or not info.st_blocks:
        raise CheckError('reference_query_unavailable')
    return REFERENCE_SQL.read_text(encoding='utf-8')


def read_target(args):
    safe_socket(args.socket_dir, args.port)
    if not args.psql.is_absolute() or args.psql.name != 'psql':
        raise CheckError('local_psql_required')
    try:
        query = BEGIN + '\n' + LOCAL_ONLY + snapshot_sql() + '\nROLLBACK;'
        result = subprocess.run(
            [str(args.psql), '-X', '-qAtw', '-v', 'ON_ERROR_STOP=1', '-h', str(args.socket_dir),
             '-p', str(args.port), '-d', args.database, '-U', args.user, '-f', '-'],
            input=query.encode('utf-8'), capture_output=True, timeout=110,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'PGCLIENTENCODING': 'UTF8',
                 'PGPASSFILE': '/dev/null', 'PGCONNECT_TIMEOUT': '3',
                 'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=90000'},
        )
        if result.returncode != 0:
            raise CheckError('local_snapshot_unavailable')
        return decode_reference(result.stdout)
    except (OSError, ValueError, RecursionError, subprocess.SubprocessError):
        # PostgreSQL errors can include row values, role details or paths.
        raise CheckError('local_snapshot_unavailable') from None


def compare(reference, restored):
    if reference['serverMajor'] != restored['serverMajor']:
        return {'status': 'MISMATCH', 'check': 'postgres_major'}
    data_drift = []
    definition_drift = []
    for table in sorted(TABLES):
        expected, actual = reference['tables'][table], restored['tables'][table]
        if expected['rows'] != actual['rows'] or expected['data'] != actual['data']:
            data_drift.append(table)
        if expected['definition'] != actual['definition']:
            definition_drift.append(table)
    role_match = reference['roles'] == restored['roles']
    return {
        'status': 'MATCH' if not data_drift and not definition_drift and role_match else 'MISMATCH',
        'tablesCompared': len(TABLES),
        'rowsDiffer': data_drift,
        'definitionsDiffer': definition_drift,
        'roleAndSchemaAccessMatch': role_match,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--socket-dir', type=Path, required=True)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--user', required=True)
    parser.add_argument('--psql', type=Path, default=DEFAULT_PSQL)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535 or not all(
        re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,62}', name) for name in (args.database, args.user)
    ):
        parser.error('Use a local port and literal database and role names.')
    try:
        report = compare(read_private_reference(args.reference), read_target(args))
    except CheckError as error:
        report = {'status': 'UNAVAILABLE', 'check': str(error)}
    print(json.dumps({'scope': FORMAT, **report, 'productionCleared': False}, indent=2))
    return 0 if report['status'] == 'MATCH' else 1


if __name__ == '__main__':
    raise SystemExit(main())
