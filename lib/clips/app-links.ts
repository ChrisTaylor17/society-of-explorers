import 'server-only';
import { reelHref } from './contracts';
import { REEL_QUESTIONS } from './salon';

const pathComponents = Object.keys(REEL_QUESTIONS).map(id => ({ '/': reelHref(id) }));
const originPattern = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const packagePattern = /^(?:[A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/;
const appleIdPattern = /^[A-Z0-9]{10}\.(?:[A-Za-z][A-Za-z0-9-]*\.)+[A-Za-z0-9-]+$/;
const fingerprintPattern = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function association(kind: 'ios' | 'android', url: URL, env: Record<string, string | undefined>) {
  const origin = env.SOE_REEL_LINK_ORIGIN ?? '';
  if (origin.length > 261 || !originPattern.test(origin) || url.origin !== origin || url.search) return null;
  if (kind === 'ios') {
    const appId = env.SOE_REEL_IOS_APP_ID ?? '';
    if (appId.length > 266 || appId !== appId.trim() || !appleIdPattern.test(appId)) return null;
    return { applinks: { details: [{ appIDs: [appId], components: pathComponents }] } };
  }
  const packageName = env.SOE_REEL_ANDROID_PACKAGE ?? '', fingerprint = env.SOE_REEL_ANDROID_CERT_SHA256 ?? '';
  if (packageName.length > 255 || packageName !== packageName.trim() || !packagePattern.test(packageName)
    || fingerprint.length !== 95 || !fingerprintPattern.test(fingerprint)) return null;
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: [fingerprint] },
  }];
}

export function reelAppAssociation(kind: 'ios' | 'android', req: Request) {
  const document = association(kind, new URL(req.url), process.env);
  return document ? Response.json(document, { headers: { 'Cache-Control': 'public, max-age=300' } })
    : new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
