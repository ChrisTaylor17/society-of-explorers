'use strict';
// Build-time PUBLIC policy validator, also exercised directly by offline tests.
// It reads no files, environment, signing material or account configuration.
function memberConfig(origin, storageKey, providerOrigin = '', publishableKey = '') {
  if (typeof origin !== 'string' || typeof storageKey !== 'string') throw Error('Invalid public member policy');
  if (origin === '' && storageKey === '' && providerOrigin === '' && publishableKey === '') return { origin: '', storageKey: '' };
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?$/.test(origin) || origin.length > 300
    || !/^[A-Za-z0-9._-]{1,160}$/.test(storageKey)) throw Error('Invalid public member policy');
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.hostname.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-')))
    throw Error('Invalid public member policy');
  if (providerOrigin === '' && publishableKey === '') return { origin, storageKey };
  if (typeof providerOrigin !== 'string' || typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(publishableKey)) throw Error('Invalid public auth policy');
  memberConfig(providerOrigin, storageKey);
  return { origin, storageKey, providerOrigin, publishableKey, authPolicy: 'supabase-password-v1' };
}
function reelLinkHost(origin) {
  memberConfig(origin, 'reel-link');
  if (origin.length > 261 || !/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(origin))
    throw Error('A DNS hostname on the default HTTPS port is required for Reel links.');
  return new URL(origin).hostname;
}
module.exports = { memberConfig, reelLinkHost };
if (require.main === module) {
  try {
    if (![4, 6, 7].includes(process.argv.length)) throw Error('Invalid public member policy');
    const policy = memberConfig(process.argv[2], process.argv[3], process.argv[4], process.argv[5]);
    const links = process.argv[6];
    if (links !== undefined && links !== 'true' && links !== 'false') throw Error('Invalid Reel link policy');
    process.stdout.write(JSON.stringify(links === 'true' ? { ...policy, reelLinkHost: reelLinkHost(policy.origin) } : policy));
  } catch { process.stderr.write('SoE member public configuration rejected.\n'); process.exitCode = 1; }
}
