from pathlib import Path
import datetime
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request

root = Path(__file__).resolve().parents[3]
prefix, run = sys.argv[1:]
assert re.fullmatch(r'built-shell-guide-program-read-[a-z0-9-]+-', prefix)
assert re.fullmatch(r'guide-program-http-[0-9]+', run)
evidence = root / 'verification/web/evidence'
ready = json.loads((evidence / (prefix + 'server-ready.json')).read_text())
assert ready['status'] == 'READY'
origin = ready['origin']
assert re.fullmatch(r'http://127\.0\.0\.1:[0-9]+', origin)
assert (root / '.next/BUILD_ID').read_text().strip() == ready['buildId']
out = evidence / run
out.mkdir(exist_ok=False)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
salon = '10000000-0000-4000-8000-000000000001'
paths = ['/api/salons/' + salon, '/api/salons/' + salon + '/sessions', '/api/salons/my-salon']
responses = []
observations = []
failure = None

def get(path, headers, status):
    request = urllib.request.Request(origin + path, headers=headers, method='GET')
    try:
        response = opener.open(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = json.loads(response.read())
        vary = ','.join(response.headers.get_all('vary', []))
        observations.append({'path': path, 'url': response.geturl(), 'status': response.status,
            'cacheControl': response.headers.get_all('cache-control', []),
            'surrogateControl': response.headers.get_all('surrogate-control', []), 'vary': vary, 'body': body})
        assert response.geturl() == origin + path, 'Unexpected redirect'
        assert response.status == status, (path, response.status)
        assert list(body) == ['error'], (path, body)
        assert 'private' in response.headers['cache-control'] and 'no-store' in response.headers['cache-control'], 'Private cache policy missing'
        assert response.headers['surrogate-control'] == 'no-store', 'Surrogate cache policy missing'
        vary_tokens = {value.strip().lower() for value in vary.split(',')}
        assert {'cookie', 'authorization'} <= vary_tokens, 'Identity vary policy missing'
        assert all(value not in json.dumps(body) for value in ['PRIVATE_', 'environment', 'SUPABASE', 'NONISSUED'])
        return {'path': path, 'status': response.status, 'body': body}

try:
    for scenario, headers in [
        ('anonymous', {}),
        ('nonissued document hint', {'Cookie': 'sb-synthetic-auth-token=NONISSUED_DOCUMENT_HINT'}),
        ('signed-out marker with retained bearer', {'Cookie': 'soe_auth_provider=signed_out', 'Authorization': 'Bearer NONISSUED_RETAINED_TOKEN'}),
    ]:
        for path in paths:
            responses.append({'scenario': scenario, **get(path, headers, 401)})
    responses.append({'scenario': 'missing server configuration', **get('/api/salons?status=recruiting,active', {}, 503)})
except BaseException as error:
    failure = repr(error)
finally:
    files = ['app/api/salons/route.ts', 'app/api/salons/[salonId]/route.ts',
        'app/api/salons/[salonId]/sessions/route.ts', 'app/api/salons/my-salon/route.ts',
        'lib/salons/index.ts', 'lib/salons/read-access.ts', 'lib/getAuthenticatedMember.ts',
        'verification/web/scripts/verify-guide-program-http.py']
    receipt = {'status': 'FAIL' if failure else 'PASS', 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'buildId': ready['buildId'], 'responses': responses, 'observations': observations, 'failure': failure,
        'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files},
        'scope': 'Ten actual compiled loopback GET requests, no API interception. Only nonissued hints/tokens and signed-out state; no real authenticated/provider/hosted/device acceptance. No writes or issued credentials.'}
    (out / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'status': receipt['status'], 'actualHttpRequests': len(responses), 'failure': failure}))
sys.exit(1 if failure else 0)
