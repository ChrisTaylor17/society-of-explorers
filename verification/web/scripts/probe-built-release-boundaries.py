"""Check the compiled release's anonymous, cross-origin and retired API paths."""

import argparse
import http.client
import json
from pathlib import Path
import re
import stat
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / 'verification/web/evidence'
ROOM = '/api/live/30000000-0000-4000-8000-000000000001'
ADVICE = '/api/admin/circles/11111111-1111-4111-8111-111111111111/messages/22222222-2222-4222-8222-222222222222/advice'


def resident(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or not info.st_blocks or not info.st_size:
        raise ValueError(f'Unavailable resident input {path.name}')
    return path.read_bytes()


def verify(origin, cases):
    for label, method, path, request_body, headers, status, fields in cases:
        connection = http.client.HTTPConnection(origin.hostname, origin.port, timeout=8)
        try:
            if request_body is not None:
                headers = {'Content-Type': 'application/json', **headers}
            body = json.dumps(request_body) if request_body is not None else None
            connection.request(method, path, body, headers)
            response = connection.getresponse()
            assert response.status == status, f'{label}: expected HTTP {status}, got {response.status}'
            cache = response.getheader('Cache-Control', '')
            assert 'no-store' in cache.lower(), f'{label}: cache policy'
            assert response.getheader('Content-Type', '').lower().startswith('application/json'), label
            raw = response.read(4097)
            assert len(raw) <= 4096, label
            payload = json.loads(raw)
            assert payload == fields, f'{label}: unexpected response shape'
            yield {'check': label, 'method': method, 'path': path, 'status': status, 'noStore': True}
        finally:
            connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('prefix')
    args = parser.parse_args()
    if not re.fullmatch(r'built-shell-[a-z0-9-]{1,48}-', args.prefix):
        parser.error('Use the running loopback server receipt prefix')
    ready = json.loads(resident(EVIDENCE / (args.prefix + 'server-ready.json')))
    build_id = resident(ROOT / '.next/BUILD_ID').decode().strip()
    assert ready['status'] == 'READY' and build_id == ready['buildId']
    url = ready['origin']
    assert re.fullmatch(r'http://127\.0\.0\.1:\d{4,5}', url)
    origin = urlsplit(url)
    same = {'Origin': url, 'Sec-Fetch-Site': 'same-origin'}
    cross = {'Origin': 'https://other.invalid', 'Sec-Fetch-Site': 'cross-site'}
    localhost = {'Origin': f'http://localhost:{origin.port}', 'Sec-Fetch-Site': 'same-origin'}
    signed_out = {'error': 'Unauthorized', 'session': 'signed_out', 'browserSignedOut': False}
    old_answers = {'error': 'Practice answers are available to their authors.'}
    cases = [
        ('Anonymous member lookup', 'GET', '/api/auth/member', None, {}, 401, signed_out),
        ('Browser sign-out marker', 'GET', '/api/auth/member', None,
         {'Cookie': 'soe_auth_provider=signed_out'}, 401, {**signed_out, 'browserSignedOut': True}),
        ('Live Council requires sign-in', 'POST', ROOM, {'action': 'join'}, same, 401, {'error': 'Unauthorized'}),
        ('Live Council management requires sign-in', 'POST', '/api/live', {'action': 'go_live'}, same, 401,
         {'error': 'Unauthorized'}),
        ('Cross-origin Live Council join', 'POST', ROOM, {'action': 'join'}, cross, 403, {'error': 'Forbidden'}),
        ('Distinct loopback origins', 'POST', ROOM, {'action': 'join'}, localhost, 403, {'error': 'Forbidden'}),
        ('Forwarded host cannot select an origin', 'POST', ROOM, {'action': 'join'},
         {**localhost, 'X-Forwarded-Host': f'localhost:{origin.port}'}, 403, {'error': 'Forbidden'}),
        ('Invalid Live Council identifier', 'POST', '/api/live/invalid', {'action': 'join'}, same, 400,
         {'error': 'Invalid session id'}),
        ('Retired Practice response list', 'GET', '/api/practice/responses', None, {}, 410, old_answers),
        ('Retired Practice peer answers', 'GET', '/api/practice/others', None, {}, 410, old_answers),
        ('Practice write requires sign-in', 'POST', '/api/practice/respond',
         {'questionId': '33333333-3333-4333-8333-333333333333', 'responseText': 'Synthetic fixture answer'}, same, 401,
         {'error': 'Authentication required.'}),
        ('Distinct loopback origin cannot submit Practice', 'POST', '/api/practice/respond',
         {'questionId': '33333333-3333-4333-8333-333333333333', 'responseText': 'Synthetic fixture answer'}, localhost, 403,
         {'error': 'Use this site to submit the request.'}),
        ('Retired direct reading awards', 'POST', '/api/exp/award', {}, same, 410,
         {'error': 'Direct reading awards are unavailable.'}),
        ('Circle AI advice disabled', 'POST', ADVICE, {}, same, 503,
         {'error': 'AI advice is unavailable. Human review remains available.'}),
    ]
    checks = list(verify(origin, cases))
    result = {'status': 'PASS', 'buildId': build_id, 'checks': checks,
              'scope': 'Actual compiled Next handlers over loopback with synthetic inputs and no provider credentials.'}
    with (EVIDENCE / (args.prefix + 'release-boundary-probe.json')).open('x') as file:
        json.dump(result, file, indent=2)
        file.write('\n')
    print(json.dumps({'status': 'PASS', 'checks': len(checks), 'buildId': build_id}))


if __name__ == '__main__':
    main()
