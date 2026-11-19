from pathlib import Path
import hashlib, json, re

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'platforms'
manifest = json.loads((BASE / 'source/ACCOUNT_HANDOVER_SHA256.json').read_text())
archive = BASE / 'source/account-handover'
actual = {str(p.relative_to(archive)) for p in archive.rglob('*') if p.is_file()}
assert actual == set(manifest), 'Source archive inventory changed'
for relative, expected in manifest.items():
    assert hashlib.sha256((archive / relative).read_bytes()).hexdigest() == expected, relative

active = {}
for directory in ['native', 'shared', 'quest']:
    for path in sorted((BASE / directory).rglob('*')):
        if path.is_file() and not any(part in ['node_modules', '.expo', '.gradle', 'build', 'dist'] for part in path.relative_to(BASE).parts):
            active[str(path.relative_to(BASE))] = hashlib.sha256(path.read_bytes()).hexdigest()
output = BASE / 'PLATFORM_SOURCE_SHA256.json'
output.write_text(json.dumps(active, indent=2, sort_keys=True) + '\n')

# The active product entry must resolve its actual imported source graph, including
# the canonical web contract. React/Expo are external locked runtime dependencies.
seen, external, missing = set(), set(), set()
pending = [BASE / 'native/index.ts']
while pending:
    path = pending.pop()
    if path in seen:
        continue
    seen.add(path)
    for imported in re.findall(r'''(?:from\s*|import\s*\(|import\s*)['"]([^'"]+)''', path.read_text()):
        if imported.startswith('@/'):
            target = ROOT / imported[2:]
        elif imported.startswith('.'):
            target = path.parent / imported
        else:
            external.add(imported)
            continue
        candidates = [target] + [Path(str(target) + suffix) for suffix in ['.ts', '.tsx', '.mjs', '.js']]
        resolved = next((candidate.resolve() for candidate in candidates if candidate.is_file()), None)
        if resolved:
            pending.append(resolved)
        else:
            missing.add(str(target))
assert not missing, sorted(missing)
record = {'status': 'PASS', 'sourceArchiveFiles': len(manifest), 'sourceArchiveExact': True,
          'activeFiles': len(active), 'activeManifest': str(output.relative_to(ROOT)),
          'nativeEntrySourceClosure': [str(path.relative_to(ROOT)) for path in sorted(seen)],
          'externalNativeImports': sorted(external), 'missingRelativeImports': sorted(missing),
          'nativeBinaryOrDeviceVerified': False, 'productionClearance': False}
(BASE / 'evidence/import-verification.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({key: value for key, value in record.items() if key != 'nativeEntrySourceClosure'}))
