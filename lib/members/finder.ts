import { parsePublicMemberProfileResponse, type PublicMemberProfile } from './profile';

export const DIRECTORY_LIMIT = 50;
export const DIRECTORY_EXPECTED_OWNER_HEADER = 'x-soe-expected-member';
export const DIRECTORY_OWNER_HEADER = 'x-soe-directory-owner';
export const FINDER_QUERY_LIMIT = 160;
const ignored = new Set(['a', 'an', 'and', 'are', 'for', 'i', 'in', 'is', 'looking', 'of', 'or', 'someone', 'the', 'to', 'who', 'with']);
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const words = (value: string) => (normalize(value).match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu) ?? [])
  .map(word => word.replace(/[.-]+$/g, '')).filter(Boolean);

export function finderTerms(value: string): string[] {
  return [...new Set(words(value.slice(0, FINDER_QUERY_LIMIT)).filter(word => !ignored.has(word)))].slice(0, 12);
}

export function parsePublishedDirectory(value: unknown): PublicMemberProfile[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Array.isArray(body.members) || body.members.length > DIRECTORY_LIMIT) return null;
  const seen = new Set<string>(), result: PublicMemberProfile[] = [];
  for (const row of body.members) {
    const member = parsePublicMemberProfileResponse({ profile: row });
    if (!member || seen.has(member.id)) return null;
    seen.add(member.id); result.push(member);
  }
  return result;
}

export type MemberFinderResult = {
  member: PublicMemberProfile;
  reasons: Array<{ field: string; terms: string[] }>;
  matchedTerms: string[];
};

/** Word matches over explicitly published profiles, never a personality,
 * faith, trust or compatibility score. Refresh the directory before searching. */
export function findPublishedMembers(profiles: PublicMemberProfile[], query: string, ownerId: string): MemberFinderResult[] {
  const terms = finderTerms(query);
  if (!terms.length) return [];
  return profiles.filter(profile => profile.id !== ownerId.toLowerCase()).map(member => {
    const fields: Array<[string, string]> = [
      ['Name', member.display_name], ['Discipline', member.discipline ?? ''], ['Skills', member.skills.join(' ')],
      ['Project', member.project_description ?? ''], ['Looking for', member.seeking ?? ''],
      ['About', member.bio ?? ''], ['Philosophy', member.philosophy ?? ''],
    ];
    const reasons = fields.map(([field, value]) => {
      const tokens = words(value);
      return { field, terms: terms.filter(term => tokens.some(token => token.startsWith(term))) };
    }).filter(reason => reason.terms.length > 0);
    return { member, reasons, matchedTerms: terms.filter(term => reasons.some(reason => reason.terms.includes(term))) };
  }).filter(result => result.matchedTerms.length > 0).sort((left, right) =>
    right.matchedTerms.length - left.matchedTerms.length ||
    normalize(left.member.display_name).localeCompare(normalize(right.member.display_name), 'en') || left.member.id.localeCompare(right.member.id));
}
