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
FORMAT = 'soe-privacy-restore-v2'
AUTH_FORMAT = 'soe-privacy-restore-v3'
DIRECT_FORMAT = 'soe-privacy-restore-v4'
AUTH_DIRECT_FORMAT = 'soe-privacy-restore-v5'
WALLET_FORMAT = 'soe-privacy-restore-v6'
CIRCLES_FORMAT = 'soe-privacy-restore-v7'
CIRCLES_WALLET_FORMAT = 'soe-privacy-restore-v8'
CIRCLE_RELEASE_FORMAT = 'soe-privacy-restore-v9'
FIRST_RELEASE_FORMAT = 'soe-privacy-restore-v10'
ACCOUNT_DELETION_FORMAT = 'soe-privacy-restore-v11'
VOICE_ARCHIVE_FORMAT = 'soe-privacy-restore-v12'
VOICE_RELEASE_FORMAT = 'soe-privacy-restore-v13'
WADDLE_ERASURE_FORMAT = 'soe-privacy-restore-v14'
MEMBER_SAFETY_FORMAT = 'soe-privacy-restore-v15'
CIRCLE_MEMBER_BLOCKS_FORMAT = 'soe-privacy-restore-v16'
MEMBER_BLOCK_ERASURE_FORMAT = 'soe-privacy-restore-v17'
CORE_PRACTICE_FORMAT = 'soe-privacy-restore-v1'
CORE_PRACTICE_TABLES = frozenset({
    'members', 'reading_progress', 'book_highlights', 'great_books_progress',
    'great_books_highlights', 'book_reflections', 'thinker_memory', 'daily_questions',
    'matched_conversations', 'practice_reflections', 'question_responses',
})
ROOM_TABLES = frozenset({'video_rooms', 'room_participants', 'room_transcripts'})
TABLES = CORE_PRACTICE_TABLES | ROOM_TABLES
AUTH_TABLES = frozenset({'auth.users', 'auth.identities'})
DIRECT_TABLES = frozenset({'direct_messages'})
WALLET_TABLES = frozenset({'soe_wallet_private.used_challenges', 'soe_wallet_private.revoked_sessions'})
CIRCLE_TABLES = frozenset({'book_cohorts', 'book_cohort_members', 'seminar_messages'})
CIRCLE_RELEASE_TABLES = frozenset({
    'circle_discussion_post_receipts',
    'circle_message_ai_allowance',
    'circle_message_ai_attempts',
    'circle_message_ai_consents',
    'circle_message_decisions',
    'circle_message_receipts',
    'circle_message_reply_links',
    'circle_message_reports',
    'circle_message_states',
    'circle_participation_receipts',
    'circle_passage_post_receipts',
    'circle_private',
    'circle_report_receipts',
    'circle_reports',
    'circle_review_coverage_pages',
    'circle_review_coverage_sessions',
    'circle_review_decisions',
    'circle_reviewer_grants',
    'circle_rsvps',
    'circle_salon_presence',
})
RELEASE_TABLES = TABLES | AUTH_TABLES | DIRECT_TABLES | CIRCLE_TABLES | WALLET_TABLES | CIRCLE_RELEASE_TABLES
DELETION_PRIVATE_TABLES = frozenset(f'soe_account_deletion_private.{name}' for name in (
    'requests', 'processing', 'identity_gate', 'private_data_receipts',
    'circle_post_targets', 'circle_post_receipts', 'circle_post_context',
    'contact_receipts', 'contact_context', 'circle_departure_receipts', 'circle_departure_context',
    'identity_removals', 'identity_removal_context', 'twiddle_erasure_receipts', 'twiddle_erasure_targets',
))
DELETION_AUTH_TABLES = frozenset({'auth.sessions', 'auth.refresh_tokens', 'auth.flow_state'})
ARCHIVED_TWIDDLE_TABLES = frozenset({'twiddles', 'twiddle_collaborators', 'twiddle_reactions'})
DELETION_TABLES = DELETION_PRIVATE_TABLES | DELETION_AUTH_TABLES | ARCHIVED_TWIDDLE_TABLES
VOICE_ARCHIVE_TABLES = ARCHIVED_TWIDDLE_TABLES | {'waddles'}
TABLES_BY_SCOPE = {
    CORE_PRACTICE_FORMAT: CORE_PRACTICE_TABLES,
    FORMAT: TABLES,
    AUTH_FORMAT: TABLES | AUTH_TABLES,
    DIRECT_FORMAT: TABLES | DIRECT_TABLES,
    AUTH_DIRECT_FORMAT: TABLES | AUTH_TABLES | DIRECT_TABLES,
    WALLET_FORMAT: TABLES | AUTH_TABLES | DIRECT_TABLES | WALLET_TABLES,
    CIRCLES_FORMAT: TABLES | AUTH_TABLES | DIRECT_TABLES | CIRCLE_TABLES,
    CIRCLES_WALLET_FORMAT: TABLES | AUTH_TABLES | DIRECT_TABLES | CIRCLE_TABLES | WALLET_TABLES,
    CIRCLE_RELEASE_FORMAT: RELEASE_TABLES,
    FIRST_RELEASE_FORMAT: RELEASE_TABLES,
    ACCOUNT_DELETION_FORMAT: RELEASE_TABLES | DELETION_TABLES,
    VOICE_ARCHIVE_FORMAT: TABLES | AUTH_TABLES | DIRECT_TABLES | CIRCLE_TABLES | VOICE_ARCHIVE_TABLES,
    VOICE_RELEASE_FORMAT: RELEASE_TABLES | DELETION_TABLES | VOICE_ARCHIVE_TABLES,
    WADDLE_ERASURE_FORMAT: RELEASE_TABLES | DELETION_TABLES | VOICE_ARCHIVE_TABLES
    | {'soe_account_deletion_private.waddle_erasure_receipts'},
}
TABLES_BY_SCOPE[MEMBER_SAFETY_FORMAT] = TABLES_BY_SCOPE[WADDLE_ERASURE_FORMAT] | {'soe_member_safety_private.member_blocks'}
TABLES_BY_SCOPE[CIRCLE_MEMBER_BLOCKS_FORMAT] = TABLES_BY_SCOPE[MEMBER_SAFETY_FORMAT]
TABLES_BY_SCOPE[MEMBER_BLOCK_ERASURE_FORMAT] = TABLES_BY_SCOPE[CIRCLE_MEMBER_BLOCKS_FORMAT] | {
    'soe_account_deletion_private.member_block_erasure_receipts',
}
CIRCLE_MEMBER_BLOCK_SCOPES = {CIRCLE_MEMBER_BLOCKS_FORMAT, MEMBER_BLOCK_ERASURE_FORMAT}
MEMBER_SAFETY_SCOPES = {MEMBER_SAFETY_FORMAT} | CIRCLE_MEMBER_BLOCK_SCOPES
DELETION_SCOPES = {ACCOUNT_DELETION_FORMAT, VOICE_RELEASE_FORMAT, WADDLE_ERASURE_FORMAT} | MEMBER_SAFETY_SCOPES
VOICE_SCOPES = {VOICE_ARCHIVE_FORMAT, VOICE_RELEASE_FORMAT, WADDLE_ERASURE_FORMAT} | MEMBER_SAFETY_SCOPES
FIRST_RELEASE_SCOPES = {FIRST_RELEASE_FORMAT} | DELETION_SCOPES
CIRCLE_RELEASE_SCOPES = {CIRCLE_RELEASE_FORMAT} | FIRST_RELEASE_SCOPES
WALLET_SCOPES = {WALLET_FORMAT, CIRCLES_WALLET_FORMAT} | CIRCLE_RELEASE_SCOPES
CIRCLE_SCOPES = {CIRCLES_FORMAT, CIRCLES_WALLET_FORMAT, VOICE_ARCHIVE_FORMAT} | CIRCLE_RELEASE_SCOPES
AUTH_SCOPES = {AUTH_FORMAT, AUTH_DIRECT_FORMAT} | WALLET_SCOPES | CIRCLE_SCOPES
DIRECT_SCOPES = {DIRECT_FORMAT, AUTH_DIRECT_FORMAT} | WALLET_SCOPES | CIRCLE_SCOPES
PRINCIPALS = ['anon', 'authenticated', 'service_role']
AUTH_PRINCIPALS = [*PRINCIPALS, 'supabase_auth_admin']
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


def decode_reference(raw, scope=FORMAT):
    if not raw or len(raw) > MAX_REFERENCE_BYTES:
        raise ValueError('Reference size')
    value = json.loads(raw, object_pairs_hook=unique_object)
    principals = AUTH_PRINCIPALS if scope in AUTH_SCOPES else PRINCIPALS
    keys = {'format', 'serverMajor', 'principals', 'roles', 'tables'}
    if scope in WALLET_SCOPES:
        keys.add('walletRoutines')
    if scope in CIRCLE_RELEASE_SCOPES:
        keys.add('circleRoutines')
    if scope in FIRST_RELEASE_SCOPES:
        keys.add('releaseServiceRoutines')
    if scope in DELETION_SCOPES:
        keys.add('accountDeletionRoutines')
    if (not isinstance(value, dict)
            or set(value) != keys
            or value['format'] != scope or value['principals'] != principals
            or type(value['serverMajor']) is not int or value['serverMajor'] < 15
            or not valid_digest(value['roles'])
            or not isinstance(value['tables'], dict) or set(value['tables']) != TABLES_BY_SCOPE[scope]):
        raise ValueError('Reference shape')
    if scope in WALLET_SCOPES and not valid_digest(value['walletRoutines']):
        raise ValueError('Wallet routine evidence')
    if scope in CIRCLE_RELEASE_SCOPES and not valid_digest(value['circleRoutines']):
        raise ValueError('Circle routine evidence')
    if scope in FIRST_RELEASE_SCOPES and not valid_digest(value['releaseServiceRoutines']):
        raise ValueError('Release service routine evidence')
    if scope in DELETION_SCOPES and not valid_digest(value['accountDeletionRoutines']):
        raise ValueError('Account deletion routine evidence')
    for entry in value['tables'].values():
        if (not isinstance(entry, dict) or set(entry) != {'rows', 'data', 'definition'}
                or type(entry['rows']) is not int or not 0 <= entry['rows'] <= 2**63 - 1
                or not valid_digest(entry['data']) or not valid_digest(entry['definition'])):
            raise ValueError('Table evidence shape')
    return value


def valid_digest(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def read_private_reference(path, scope):
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077
                    or not 0 < info.st_size <= MAX_REFERENCE_BYTES or not info.st_blocks):
                raise ValueError('Owner-only resident file required')
            return decode_reference(stream.read(MAX_REFERENCE_BYTES + 1), scope)
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
        include_rooms = 'off' if args.scope == CORE_PRACTICE_FORMAT else 'on'
        include_auth = 'on' if args.scope in AUTH_SCOPES else 'off'
        include_direct = 'on' if args.scope in DIRECT_SCOPES else 'off'
        include_wallet = 'on' if args.scope in WALLET_SCOPES else 'off'
        include_circles = 'on' if args.scope in CIRCLE_SCOPES else 'off'
        include_circle_release = 'on' if args.scope in CIRCLE_RELEASE_SCOPES else 'off'
        include_first_release = 'on' if args.scope in FIRST_RELEASE_SCOPES else 'off'
        include_account_deletion = 'on' if args.scope in DELETION_SCOPES else 'off'
        include_voice_archive = 'on' if args.scope in VOICE_SCOPES else 'off'
        include_waddle_erasure = 'on' if args.scope in {WADDLE_ERASURE_FORMAT} | MEMBER_SAFETY_SCOPES else 'off'
        include_member_safety = 'on' if args.scope in MEMBER_SAFETY_SCOPES else 'off'
        include_circle_member_blocks = 'on' if args.scope in CIRCLE_MEMBER_BLOCK_SCOPES else 'off'
        include_member_block_erasure = 'on' if args.scope == MEMBER_BLOCK_ERASURE_FORMAT else 'off'
        result = subprocess.run(
            [str(args.psql), '-X', '-qAtw', '-v', 'ON_ERROR_STOP=1',
             '-v', f'soe_restore_include_rooms={include_rooms}', '-v', f'soe_restore_include_auth={include_auth}',
             '-v', f'soe_restore_include_direct_messages={include_direct}',
             '-v', f'soe_restore_include_wallet_state={include_wallet}',
             '-v', f'soe_restore_include_circles={include_circles}',
             '-v', f'soe_restore_include_circle_release_state={include_circle_release}',
             '-v', f'soe_restore_include_first_release_state={include_first_release}',
             '-v', f'soe_restore_include_account_deletion_state={include_account_deletion}',
             '-v', f'soe_restore_include_voice_archive={include_voice_archive}',
             '-v', f'soe_restore_include_waddle_erasure={include_waddle_erasure}',
             '-v', f'soe_restore_include_member_safety={include_member_safety}',
             '-v', f'soe_restore_include_circle_member_blocks={include_circle_member_blocks}',
             '-v', f'soe_restore_include_member_block_erasure={include_member_block_erasure}',
             '-h', str(args.socket_dir),
             '-p', str(args.port), '-d', args.database, '-U', args.user, '-f', '-'],
            input=query.encode('utf-8'), capture_output=True, timeout=110,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'PGCLIENTENCODING': 'UTF8',
                 'PGPASSFILE': '/dev/null', 'PGCONNECT_TIMEOUT': '3',
                 'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=90000'},
        )
        if result.returncode != 0:
            raise CheckError('local_snapshot_unavailable')
        return decode_reference(result.stdout, args.scope)
    except (OSError, ValueError, RecursionError, subprocess.SubprocessError):
        # PostgreSQL errors can include row values, role details or paths.
        raise CheckError('local_snapshot_unavailable') from None


def compare(reference, restored):
    if reference['serverMajor'] != restored['serverMajor']:
        return {'status': 'MISMATCH', 'check': 'postgres_major'}
    data_drift = []
    definition_drift = []
    for table in sorted(reference['tables']):
        expected, actual = reference['tables'][table], restored['tables'][table]
        if expected['rows'] != actual['rows'] or expected['data'] != actual['data']:
            data_drift.append(table)
        if expected['definition'] != actual['definition']:
            definition_drift.append(table)
    role_match = reference['roles'] == restored['roles']
    wallet_match = reference.get('walletRoutines') == restored.get('walletRoutines')
    circle_match = reference.get('circleRoutines') == restored.get('circleRoutines')
    service_match = reference.get('releaseServiceRoutines') == restored.get('releaseServiceRoutines')
    deletion_match = reference.get('accountDeletionRoutines') == restored.get('accountDeletionRoutines')
    matched = (not data_drift and not definition_drift and role_match and wallet_match
               and circle_match and service_match and deletion_match)
    return {
        'status': 'MATCH' if matched else 'MISMATCH',
        'tablesCompared': len(reference['tables']),
        'rowsDiffer': data_drift,
        'definitionsDiffer': definition_drift,
        'roleAndSchemaAccessMatch': role_match,
        **({'walletRoutinesMatch': wallet_match} if reference['format'] in WALLET_SCOPES else {}),
        **({'circleRoutinesMatch': circle_match} if reference['format'] in CIRCLE_RELEASE_SCOPES else {}),
        **({'releaseServiceRoutinesMatch': service_match} if reference['format'] in FIRST_RELEASE_SCOPES else {}),
        **({'accountDeletionRoutinesMatch': deletion_match} if reference['format'] in DELETION_SCOPES else {}),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--socket-dir', type=Path, required=True)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--user', required=True)
    parser.add_argument('--psql', type=Path, default=DEFAULT_PSQL)
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument('--core-practice-only', dest='scope', action='store_const', const=CORE_PRACTICE_FORMAT,
                       help='Compare an 11-table Core and Daily Practice reference.')
    scope.add_argument('--include-auth', dest='scope', action='store_const', const=AUTH_FORMAT,
                       help='Compare a 16-table reference including Supabase Auth users and identities.')
    parser.add_argument('--include-direct-messages', action='store_true',
                        help='Include direct messages and their publication metadata, with Auth when requested.')
    parser.add_argument('--include-wallet-state', action='store_true',
                        help='Compare a 19-table reference including Auth, direct messages and both wallet stores and their routines.')
    parser.add_argument('--include-circles', action='store_true',
                        help='Compare a 20-table reference including Auth, direct messages and the three legacy Circle tables. '
                             'With --include-wallet-state, compare 22 tables and the wallet routines.')
    parser.add_argument('--include-circle-release-state', action='store_true',
                        help='Compare the 42-table reference after the Circle and wallet release migrations, including Circle routines.')
    parser.add_argument('--include-first-release-state', action='store_true',
                        help='Compare the 42-table release reference with the Practice and Live Council service routines.')
    parser.add_argument('--include-account-deletion-state', action='store_true',
                        help='Compare the 63-table reference after the account erasure migrations, including deletion routines.')
    parser.add_argument('--include-voice-archive', action='store_true',
                        help='Compare the 24-table pre-cutover reference including Waddle and Twiddle. '
                             'Combine with --include-account-deletion-state for the 64-table release reference.')
    parser.add_argument('--include-waddle-erasure', action='store_true',
                        help='Compare the 65-table release reference including Waddle removal receipts.')
    parser.add_argument('--include-member-safety', action='store_true',
                        help='Compare the 66-table release reference including private member blocks.')
    parser.add_argument('--include-circle-member-blocks', action='store_true',
                        help='Compare the 66-table release reference with the Circle block routines.')
    parser.add_argument('--include-member-block-erasure', action='store_true',
                        help='Compare the 67-table release reference including member block removal receipts.')
    parser.set_defaults(scope=FORMAT)
    args = parser.parse_args()
    member_scopes = [
        scope for selected, scope in (
            (args.include_waddle_erasure, WADDLE_ERASURE_FORMAT),
            (args.include_member_safety, MEMBER_SAFETY_FORMAT),
            (args.include_circle_member_blocks, CIRCLE_MEMBER_BLOCKS_FORMAT),
            (args.include_member_block_erasure, MEMBER_BLOCK_ERASURE_FORMAT),
        ) if selected
    ]
    if member_scopes:
        if args.scope != FORMAT or any((
            args.include_direct_messages, args.include_wallet_state, args.include_circles,
            args.include_circle_release_state, args.include_first_release_state,
            args.include_account_deletion_state, args.include_voice_archive,
            len(member_scopes) != 1,
        )):
            parser.error('Use one of --include-member-block-erasure, --include-circle-member-blocks, '
                         '--include-member-safety, or --include-waddle-erasure by itself.')
        args.scope = member_scopes[0]
    elif args.include_voice_archive:
        if (args.scope == CORE_PRACTICE_FORMAT or args.include_wallet_state
                or args.include_circle_release_state or args.include_first_release_state):
            parser.error('Use --include-voice-archive alone or with --include-account-deletion-state.')
        args.scope = VOICE_RELEASE_FORMAT if args.include_account_deletion_state else VOICE_ARCHIVE_FORMAT
    elif args.include_account_deletion_state:
        if args.scope == CORE_PRACTICE_FORMAT:
            parser.error('Use the full restore scope to include account deletion state.')
        args.scope = ACCOUNT_DELETION_FORMAT
    elif args.include_first_release_state:
        if args.scope == CORE_PRACTICE_FORMAT:
            parser.error('Use the full restore scope to include first-release state.')
        args.scope = FIRST_RELEASE_FORMAT
    elif args.include_circle_release_state:
        if args.scope == CORE_PRACTICE_FORMAT:
            parser.error('Use the full restore scope to include Circle release state.')
        args.scope = CIRCLE_RELEASE_FORMAT
    elif args.include_circles:
        if args.scope == CORE_PRACTICE_FORMAT:
            parser.error('Use the full restore scope to include Circles.')
        args.scope = CIRCLES_WALLET_FORMAT if args.include_wallet_state else CIRCLES_FORMAT
    elif args.include_wallet_state:
        if args.scope == CORE_PRACTICE_FORMAT:
            parser.error('Use the full restore scope to include wallet state.')
        args.scope = WALLET_FORMAT
    elif args.include_direct_messages:
        if args.scope == CORE_PRACTICE_FORMAT:
            parser.error('Use the standard Core, Practice and Live Council scope to include direct messages.')
        args.scope = AUTH_DIRECT_FORMAT if args.scope == AUTH_FORMAT else DIRECT_FORMAT
    if not 1024 <= args.port <= 65535 or not all(
        re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,62}', name) for name in (args.database, args.user)
    ):
        parser.error('Use a local port and literal database and role names.')
    try:
        report = compare(read_private_reference(args.reference, args.scope), read_target(args))
    except CheckError as error:
        report = {'status': 'UNAVAILABLE', 'check': str(error)}
    print(json.dumps({'scope': args.scope, **report, 'productionCleared': False}, indent=2))
    return 0 if report['status'] == 'MATCH' else 1


if __name__ == '__main__':
    raise SystemExit(main())
