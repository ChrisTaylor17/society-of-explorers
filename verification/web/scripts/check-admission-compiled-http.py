"""Check credential-free admission refusals against one guarded compiled build."""
from pathlib import Path
import argparse
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ready', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
assert not args.out.exists(), 'Preserve the previous check receipt'
ready = json.loads(args.ready.read_text())
origin = ready['origin']
url = urllib.parse.urlsplit(origin)
assert ready['status'] == 'READY' and url.scheme == 'http' and url.hostname == '127.0.0.1' and url.port
assert not url.username and not url.password and not url.query and not url.fragment
for name, expected in ready['sourceHashes'].items():
    file = ROOT / name
    assert file.stat().st_blocks or not file.stat().st_size, name
    assert hashlib.sha256(file.read_bytes()).hexdigest() == expected, name
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
member = '11111111-1111-4111-8111-111111111111'
target = '22222222-2222-4222-8222-222222222222'
circle = '33333333-3333-4333-8333-333333333333'
key = '44444444-4444-4444-8444-444444444444'
base = '/api/circles/' + circle
review = {'expectedMemberId': member, 'targetMemberId': target}
issue = {**review, 'requestId': key, 'expectedRevision': 1, 'expectedInvitationRevision': 1,
         'expectedTargetLabel': 'Fictional reader', 'expiresAt': '2026-11-08T12:00:00.000Z'}
join = {'expectedMemberId': member, 'requestId': key, 'expectedRevision': 1,
        'invitationToken': 'soe-ci1.e30.' + 'A' * 43}
revoke = {'expectedMemberId': member, 'requestId': key, 'expectedRevision': 1, 'expectedInvitationRevision': 1}
cases = [
    ('signed-out review', base + '/invitation-review', 'POST', review, origin, 401),
    ('signed-out issue', base + '/invitations', 'POST', issue, origin, 401),
    ('signed-out redeem', base + '/join-invited', 'POST', join, origin, 401),
    ('signed-out revoke', base + '/invitations/revoke', 'POST', revoke, origin, 401),
    ('cross-origin review', base + '/invitation-review', 'POST', review, 'https://forged-origin.invalid', 403),
    ('extra review authority', base + '/invitation-review', 'POST', {**review, 'host': member}, origin, 400),
    ('incomplete issue', base + '/invitations', 'POST', review, origin, 400),
    ('invalid Circle', '/api/circles/not-a-circle/invitation-review', 'POST', review, origin, 400),
    ('signed-out legacy join', '/api/book-salons/join', 'POST', {'cohortId': circle}, origin, 401),
    ('issue has no GET action', base + '/invitations', 'GET', None, origin, 405),
    ('public pilot plan', '/salons/pilot', 'GET', None, origin, 200),
]
checks = []
for label, path, method, body, request_origin, expected in cases:
    request = urllib.request.Request(origin + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Origin': request_origin, 'Content-Type': 'application/json'})
    try:
        response = opener.open(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read(200000)
        assert response.status == expected, (label, response.status, payload[:300])
        if method == 'POST':
            assert 'no-store' in response.headers.get('cache-control', ''), label
            data = json.loads(payload)
            assert 'error' in data and 'invitationToken' not in data and 'targetMemberId' not in data, label
        if label == 'public pilot plan':
            assert b'Four weeks,' in payload and b'Host and dates to be confirmed.' in payload
        checks.append({'case': label, 'path': path, 'method': method, 'status': response.status,
                       'responseSha256': hashlib.sha256(payload).hexdigest(),
                       'cacheControl': response.headers.get('cache-control')})
record = {'status': 'PASS', 'origin': origin, 'buildId': ready['buildId'], 'checks': checks,
          'scope': 'Actual local compiled HTTP; synthetic bodies and no cookies, bearer tokens or issued credentials. Successful hosted sign-in/admission and browser/device acceptance are outside this check.',
          'issuedCredentialsSupplied': False, 'hostedRequests': False}
args.out.write_text(json.dumps(record, indent=2) + '\n')
args.out.chmod(0o600)
print(json.dumps({'status': 'PASS', 'checks': len(checks), 'receipt': str(args.out)}))
