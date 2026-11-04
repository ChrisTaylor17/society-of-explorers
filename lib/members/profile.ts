// Shared pure profile contract. Browser/API parsers never infer publication from
// a name, existing raw-table policy, activity or a missing visibility column.
export const PROFILE_LIMITS = { displayName: 200, bio: 2000, discipline: 100, skills: 40,
  skill: 100, projectDescription: 2000, seeking: 1000, philosophy: 2000 } as const;
export type ProfileFields = { displayName: string; bio: string; discipline: string; skills: string[];
  projectDescription: string; seeking: string; philosophy: string };
export type ProfileVisibility = 'private' | 'public';
export type OwnerProfile = { memberId: string; revision: number; visibility: ProfileVisibility; profile: ProfileFields };
export type PublicMemberProfile = { id: string; display_name: string; bio: string | null; discipline: string | null;
  skills: string[]; project_description: string | null; seeking: string | null; philosophy: string | null };
export type ProfilePatch = Partial<ProfileFields> & { visibility?: ProfileVisibility };
export type ProfileMutation = { expectedMemberId: string; expectedRevision: number; patch: ProfilePatch };
export const PUBLIC_MEMBER_SELECT = 'id,display_name,bio,discipline,skills,project_description,seeking,philosophy,profile_visibility';
export const OWNER_PROFILE_SELECT = PUBLIC_MEMBER_SELECT + ',profile_revision';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ['displayName', 'bio', 'discipline', 'skills', 'projectDescription', 'seeking', 'philosophy'] as const;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const visibility = (value: unknown): value is ProfileVisibility => value === 'private' || value === 'public';
export const isProfileMemberId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
export const isProfileRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function text(value: unknown, maximum: number, singleLine = false): value is string {
  return typeof value === 'string' && value.length <= maximum &&
    !(singleLine ? /[\u0000-\u001f\u007f]/ : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/).test(value) &&
    !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(value);
}
function validSkills(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= PROFILE_LIMITS.skills && Array.from(value).every(skill => text(skill, PROFILE_LIMITS.skill, true) && skill.trim().length > 0);
}
function validField(key: string, value: unknown): boolean {
  if (key === 'skills') return validSkills(value);
  if (!fields.includes(key as typeof fields[number])) return false;
  if (!text(value, PROFILE_LIMITS[key as Exclude<typeof fields[number], 'skills'>], key === 'displayName' || key === 'discipline')) return false;
  return key !== 'displayName' || value.trim().length > 0;
}
export function parseOwnerProfile(value: unknown): OwnerProfile | null {
  if (!record(value) || !exactKeys(value, ['memberId', 'revision', 'visibility', 'profile']) ||
      !isProfileMemberId(value.memberId) || !isProfileRevision(value.revision) || !visibility(value.visibility) ||
      !record(value.profile) || !exactKeys(value.profile, fields) || !fields.every(key => validField(key, value.profile && (value.profile as Record<string, unknown>)[key]))) return null;
  const profile = value.profile as ProfileFields;
  return { memberId: value.memberId.toLowerCase(), revision: value.revision, visibility: value.visibility,
    profile: { ...profile, skills: [...profile.skills] } };
}
export function parseProfileMutation(value: unknown): ProfileMutation | null {
  if (!record(value) || !exactKeys(value, ['expectedMemberId', 'expectedRevision', 'patch']) ||
      !isProfileMemberId(value.expectedMemberId) || !isProfileRevision(value.expectedRevision) || !record(value.patch) ||
      Object.keys(value.patch).length === 0 || !Object.entries(value.patch).every(([key, entry]) => key === 'visibility' ? visibility(entry) : validField(key, entry))) return null;
  const patch: ProfilePatch = {};
  for (const [key, entry] of Object.entries(value.patch)) {
    if (key === 'skills') patch.skills = (entry as string[]).map(skill => skill.trim());
    else if (key === 'visibility') patch.visibility = entry as ProfileVisibility;
    else (patch as Record<string, unknown>)[key] = (entry as string).trim();
  }
  return { expectedMemberId: value.expectedMemberId.toLowerCase(), expectedRevision: value.expectedRevision, patch };
}
export function ownerProfileFromRow(value: unknown): OwnerProfile | null {
  if (!record(value) || !visibility(value.profile_visibility)) return null;
  const revision = typeof value.profile_revision === 'string' && /^\d{1,16}$/.test(value.profile_revision) ? Number(value.profile_revision) : value.profile_revision;
  const optional = (key: string) => value[key] === null ? '' : value[key];
  const displayName = value.display_name === null || value.display_name === undefined ||
    (typeof value.display_name === 'string' && !value.display_name.trim()) ? 'Explorer' : value.display_name;
  return parseOwnerProfile({ memberId: value.id, revision, visibility: value.profile_visibility, profile: {
    displayName, bio: optional('bio'), discipline: optional('discipline'), skills: value.skills === null ? [] : value.skills,
    projectDescription: optional('project_description'), seeking: optional('seeking'), philosophy: optional('philosophy'),
  } });
}
export function parsePublicMemberProfile(value: unknown): PublicMemberProfile | null {
  if (!record(value) || value.profile_visibility !== 'public' || !isProfileMemberId(value.id) || !validField('displayName', value.display_name)) return null;
  const pairs = [['bio', 'bio'], ['discipline', 'discipline'], ['project_description', 'projectDescription'], ['seeking', 'seeking'], ['philosophy', 'philosophy']] as const;
  for (const [column, field] of pairs) if (value[column] !== null && !validField(field, value[column])) return null;
  const skills = value.skills === null ? [] : value.skills;
  if (!validSkills(skills)) return null;
  return { id: value.id.toLowerCase(), display_name: value.display_name as string, bio: value.bio as string | null,
    discipline: value.discipline as string | null, skills: [...skills], project_description: value.project_description as string | null,
    seeking: value.seeking as string | null, philosophy: value.philosophy as string | null };
}
