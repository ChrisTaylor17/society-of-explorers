/** Only pass a server-projected publication reference, never a membership-row
 * ID or a name-derived identity. A full navigation rechecks current publication. */
export default function PublishedProfileLink({ profileId, active = true, label = 'View published profile' }: {
  profileId: string | null | undefined;
  active?: boolean;
  label?: string;
}) {
  if (!active || typeof profileId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(profileId)) return null;
  return <a href={`/explorer/${profileId}`} referrerPolicy="no-referrer"
    style={{ color: '#c9a84c', minHeight: '44px', display: 'inline-flex', alignItems: 'center', overflowWrap: 'anywhere' }}>
    {label}
  </a>;
}
