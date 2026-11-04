"""Verify the exact 1,224-file parent and replay the bounded discussion patch.

Run from any directory. --check-only validates current source inventories and
boundaries. --replay-only also generates/applies a binary patch in temporary
copies. Neither mode writes delivery files. The default writes DISCUSSIONS.patch,
CANDIDATE_SHA256.json and evidence/delivery.json only after successful replay.
Product source, the parent delivery, runtime and HANDOFF are never written.
Root tests/support adaptations are outside the delivered product candidate.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'candidate'
BASELINE_FILE = ROOT / 'BASELINE_SHA256.json'
BASELINE_SHA256 = '9b160130bb066b98aa0abe5c882a6f6025f83b60b6547e91ab48f0a115eb3552'
BASELINE_COUNT = 1224
EXCLUDED_DIRECTORIES = {'node_modules', '.next', '.git'}
# Reviewed exact boundaries. Do not infer authorization from the current diff.
ALLOWED_CHANGES = {
    'app/circles/[circleId]/CircleDetail.tsx',
    'app/circles/messages/MessageActions.tsx',
}
ALLOWED_ADDITIONS = {
    'app/api/circles/[circleId]/discussion/preview/route.ts',
    'app/api/circles/[circleId]/discussion/route.ts',
    'app/circles/[circleId]/discussion/DiscussionBrowser.tsx',
    'app/circles/[circleId]/discussion/discussion.module.css',
    'app/circles/[circleId]/discussion/page.tsx',
    'docs/sql/circle-discussion-threads.sql',
    'docs/CIRCLE_DISCUSSION_THREADS_CONTRACT.md',
    'lib/circles/thread-server.ts', 'lib/circles/thread.ts',
}
REVIEWED_TEST_CHANGES = set()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def valid_path(name):
    if not isinstance(name, str):
        return False
    path = PurePosixPath(name)
    return (name == path.as_posix() and not path.is_absolute() and path.parts
            and all(part not in {'.', '..', *EXCLUDED_DIRECTORIES} for part in path.parts)
            and not path.name.endswith('.tsbuildinfo') and '\\' not in name)


def files(root):
    """Inventory all regular source, including dotfiles; fail closed on errors.

    Only node_modules/.next/.git directory components and *.tsbuildinfo files
    are excluded. Unreadable directories, symlinks and special files elsewhere
    refuse the entire inventory instead of disappearing from it.
    """
    require(root.is_dir() and not root.is_symlink(), 'Invalid source directory: ' + str(root))
    found = {}

    def scan_error(error):
        raise RuntimeError('Cannot inventory source directory: ' + str(error.filename)) from error

    for parent, directories, names in os.walk(root, followlinks=False, onerror=scan_error):
        directories[:] = sorted(name for name in directories if name not in EXCLUDED_DIRECTORIES)
        for name in directories:
            directory = Path(parent) / name
            require(stat.S_ISDIR(directory.lstat().st_mode),
                    'Unexpected source symlink/non-directory: ' + str(directory.relative_to(root)))
        for name in sorted(names):
            if name.endswith('.tsbuildinfo'):
                continue
            path = Path(parent) / name
            relative = path.relative_to(root).as_posix()
            require(stat.S_ISREG(path.lstat().st_mode), 'Unexpected non-regular source: ' + relative)
            require(valid_path(relative), 'Invalid source path: ' + relative)
            found[relative] = path
    return found


def manifest_for(root):
    return {name: digest(path) for name, path in sorted(files(root).items())}


def protected_groups(baseline):
    return {
        'originalEditionsAndRights': {name for name in baseline if name.startswith((
            'content/', 'lib/books/', 'app/api/great-books/', 'docs/books/'))},
        'canonicalAuthAndSupabase': {name for name in baseline if name.startswith((
            'lib/auth/', 'lib/supabase/', 'app/api/auth/', 'app/auth/', 'app/login/'))
            or name in {'lib/getAuthenticatedMember.ts', 'lib/MemberContext.tsx', 'proxy.ts'}},
        'existingCircleLogicAndModeration': {name for name in baseline if name.startswith((
            'lib/circles/', 'app/api/circles/', 'app/circles/', 'app/moderation/')) and name not in ALLOWED_CHANGES},
        'supporterOfferBillingAndSQL': {name for name in baseline if name.startswith((
            'lib/supporter/', 'app/api/supporter/', 'app/billing/', 'app/join/', 'lib/join/'))
            or name in {'docs/sql/supporter-billing.sql', 'docs/SUPPORTER_BILLING_CONTRACT.md',
                        'app/api/checkout/route.ts', 'components/CheckoutWelcome.tsx'}},
        'existingSQLAndContracts': {name for name in baseline if name.startswith(('docs/sql/', 'supabase/'))
            or name.startswith('docs/') and name.endswith('_CONTRACT.md')},
        'legacyHelpersAndCapital': {name for name in baseline if name.startswith(('lib/payments/', 'lib/capital/'))},
        'dependencies': {name for name in baseline if name in {'package.json','package-lock.json'}},
    }


def validate_candidate(baseline, manifest):
    changed = {name for name in baseline if name in manifest and manifest[name] != baseline[name]}
    added = set(manifest) - set(baseline)
    removed = set(baseline) - set(manifest)
    require(not removed, 'Removed baseline files: ' + repr(sorted(removed)))
    require(changed == ALLOWED_CHANGES, 'Changed-file boundary differs: ' + repr({
        'unexpected': sorted(changed - ALLOWED_CHANGES), 'expectedButUnchanged': sorted(ALLOWED_CHANGES - changed)}))
    require(added == ALLOWED_ADDITIONS, 'Added-file boundary differs: ' + repr({
        'unexpected': sorted(added - ALLOWED_ADDITIONS), 'missing': sorted(ALLOWED_ADDITIONS - added)}))
    protected = protected_groups(baseline)
    for label, names in protected.items():
        require(names and all(manifest.get(name) == baseline[name] for name in names), 'Protected source changed: ' + label)
    existing_tests = {name for name in baseline if name.startswith('tests/') and name not in REVIEWED_TEST_CHANGES}
    require(existing_tests and all(manifest.get(name) == baseline[name] for name in existing_tests),
            'Existing candidate tests changed')
    return changed, added, protected, existing_tests


def run(args, cwd):
    # Git is used only in temporary copies, with caller configs/hooks/filters,
    # credentials, external diffs, inherited worktree variables and textconv off.
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update({'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
                'GIT_ATTR_NOSYSTEM': '1', 'GIT_TERMINAL_PROMPT': '0', 'LC_ALL': 'C'})
    command = ['git', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=' + os.devnull,
               '-c', 'core.attributesFile=' + os.devnull, *args]
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True)
    require(result.returncode == 0, result.stderr.decode(errors='replace'))
    return result.stdout


def copy_files(source, target, names):
    for name in sorted(names):
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, destination)


def safe_output(path):
    require(not path.is_symlink() and (not path.exists() or path.is_file()), 'Unsafe delivery output: ' + str(path))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check-only', action='store_true')
    modes.add_argument('--replay-only', action='store_true')
    options = parser.parse_args()
    require(digest(BASELINE_FILE) == BASELINE_SHA256, 'Pinned baseline manifest changed')
    baseline = json.loads(BASELINE_FILE.read_text())
    require(isinstance(baseline, dict) and len(baseline) == BASELINE_COUNT
            and all(valid_path(name) and isinstance(sha, str) and re.fullmatch(r'[0-9a-f]{64}', sha)
                    for name, sha in baseline.items()), 'Invalid baseline manifest')
    origin = json.loads((ROOT / 'ORIGIN.json').read_text())
    source = Path(origin['source'])
    require(source.resolve() == (ROOT.parent / 'soe-passages/candidate').resolve(), 'Unexpected original SOURCE')
    source_manifest = Path(origin['sourceManifest'])
    require(source_manifest.resolve() == source.parent / 'CANDIDATE_SHA256.json'
            and digest(source_manifest) == BASELINE_SHA256, 'Original delivery manifest changed')
    require(manifest_for(source) == baseline, 'Original SOURCE differs from exact baseline inventory/bytes')
    manifest = manifest_for(APP)
    changed, added, protected, existing_tests = validate_candidate(baseline, manifest)
    report = {'status': 'CHECKED' if options.check_only else 'PASS',
              'baselineFiles': len(baseline), 'sourceFiles': len(manifest),
              'changed': sorted(changed), 'added': sorted(added), 'removed': [],
              'exclusions': ['node_modules/', '.next/', '.git/', '*.tsbuildinfo'],
              'sourceInventoryAndBytesUnchanged': True, 'baselineManifestSHA256': BASELINE_SHA256,
              'protectedGroups': {label: {'files': len(names), 'byteUnchanged': True} for label, names in protected.items()},
              'otherExistingCandidateTestsByteUnchanged': {'files': len(existing_tests), 'passed': True},
              'reviewedCandidateTests': sorted(REVIEWED_TEST_CHANGES),
              'allExistingPaymentAndCapitalBytesPreserved': True,
              'rootTestSupport': 'Outside candidate; local HTTP/PGlite test transport adaptations are not product changes',
              'nativeSessionAuthority': 'The web parent contains no native source tree. Separate native work is outside this patch; no native clearance is inferred'}
    if options.check_only:
        print(json.dumps(report, indent=2))
        return

    with tempfile.TemporaryDirectory(prefix='soe-discussions-replay-') as temporary:
        folder = Path(temporary)
        copy_files(source, folder, baseline)
        run(['init', '--quiet'], folder)
        run(['add', '--all', '--force'], folder)
        copy_files(APP, folder, manifest)
        run(['add', '--intent-to-add', '--all', '--force'], folder)
        patch = run(['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv'], folder)
        require(patch, 'Expected discussion patch is empty')
        patch_file = folder / '.git/DISCUSSIONS.patch'
        patch_file.write_bytes(patch)
        with tempfile.TemporaryDirectory(prefix='soe-discussions-apply-') as target_tmp:
            replay = Path(target_tmp)
            copy_files(source, replay, baseline)
            run(['apply', '--check', str(patch_file)], replay)
            run(['apply', '--binary', str(patch_file)], replay)
            require(manifest_for(replay) == manifest, 'Binary patch replay differs from candidate bytes/inventory')
        run(['diff', '--check', '--', *sorted(changed | added)], folder)

    # Refuse a concurrent edit instead of publishing a mixed-version delivery.
    require(digest(BASELINE_FILE) == BASELINE_SHA256 and digest(source_manifest) == BASELINE_SHA256,
            'A baseline manifest changed during verification')
    require(manifest_for(source) == baseline, 'Original SOURCE changed during verification')
    require(manifest_for(APP) == manifest, 'Candidate changed during verification; rerun after freeze')
    manifest_bytes = (json.dumps(manifest, indent=2) + '\n').encode()
    report.update({'binaryPatchReplay': 'PASS', 'authoredCodeWhitespace': 'PASS',
                   'manifestSHA256': hashlib.sha256(manifest_bytes).hexdigest(),
                   'patchSHA256': hashlib.sha256(patch).hexdigest(), 'patchBytes': len(patch)})
    if options.replay_only:
        report['status'] = 'CHECKED_REPLAY'
        print(json.dumps(report, indent=2))
        return
    evidence = ROOT / 'evidence'
    require(not evidence.is_symlink() and (not evidence.exists() or evidence.is_dir()), 'Unsafe evidence directory')
    outputs = [(ROOT / 'DISCUSSIONS.patch', patch), (ROOT / 'CANDIDATE_SHA256.json', manifest_bytes),
               (evidence / 'delivery.json', (json.dumps(report, indent=2) + '\n').encode())]
    for path, _ in outputs:
        safe_output(path)
    evidence.mkdir(exist_ok=True)
    for path, data in outputs:
        path.write_bytes(data)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
