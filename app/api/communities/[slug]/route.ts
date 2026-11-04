import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PUBLIC_MEMBER_SELECT, parsePublicMemberProfile, type PublicMemberProfile } from '@/lib/members/profile';
import { isPublicExplorerId } from '@/lib/explorer/publicProfile';

const unavailable = (status: number) => privateJson({ error: 'Community unavailable.' }, { status });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, maximum = 2000): string | undefined => typeof value === 'string' && value.length <= maximum ? value : undefined;
const amount = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : undefined;

// The public page consumes this small set of configuration fields. Do not pass
// an arbitrary service-role parameters object through as public metadata.
function parameters(value: unknown, kind: 'governance' | 'infrastructure') {
  if (!record(value)) return {};
  const output: Record<string, unknown> = {};
  if (kind === 'governance') {
    output.template = text(value.template, 100);
    output.initial_treasury = amount(value.initial_treasury);
    for (const token of ['reputation_token', 'governance_token']) {
      if (record(value[token])) output[token] = { symbol: text(value[token].symbol, 50) };
    }
    if (record(value.rewards)) output.rewards = { contribution: amount(value.rewards.contribution), participation: amount(value.rewards.participation), analysis: amount(value.rewards.analysis) };
  } else {
    if (Array.isArray(value.data_methods) && value.data_methods.length <= 12 && value.data_methods.every(item => text(item, 100) !== undefined)) output.data_methods = value.data_methods;
    for (const key of ['verification_method', 'hardware_needed', 'data_goal', 'problem_statement']) output[key] = text(value[key]);
  }
  return output;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return unavailable(404);
    const db = getSupabaseAdmin();
    const { data: row, error: communityError } = await db.from('communities')
      .select('id,slug,name,description,mission').eq('slug', slug).eq('is_active', true).maybeSingle();
    if (communityError) return unavailable(503);
    if (!row) return unavailable(404);
    if (!isPublicExplorerId(row.id) || row.slug !== slug || !text(row.name, 200)) return unavailable(503);
    const community = { id: row.id, slug: row.slug, name: row.name, description: text(row.description) ?? null, mission: text(row.mission) ?? null };

    const { data: contractRows, error: contractError } = await db.from('community_contracts')
      .select('contract_type,parameters').eq('community_id', row.id).limit(12);
    if (contractError || !Array.isArray(contractRows)) return unavailable(503);
    const contract = (kind: 'governance' | 'infrastructure') => {
      const matches = contractRows.filter(item => item.contract_type === kind);
      if (matches.length > 1) throw new Error('Community unavailable');
      return matches.length ? { parameters: parameters(matches[0].parameters, kind) } : null;
    };

    // Use the validated member FK so private rows cannot consume this bounded
    // public display window. Missing relation/publication schema fails closed.
    const { data: rows, error: profileError } = await db.from('community_members')
      .select('community_id,member_id,profile:members!community_members_member_id_fkey!inner(' + PUBLIC_MEMBER_SELECT + ')')
      .eq('community_id', row.id).eq('profile.profile_visibility', 'public')
      .order('joined_at', { ascending: true }).limit(20).returns<unknown[]>();
    if (profileError || !Array.isArray(rows) || rows.length > 20) return unavailable(503);
    const members: PublicMemberProfile[] = [], seen = new Set<string>();
    for (const source of rows) {
      if (!record(source)) return unavailable(503);
      const profile = parsePublicMemberProfile(source.profile);
      if (!profile || source.community_id !== row.id || source.member_id !== profile.id || seen.has(profile.id)) return unavailable(503);
      seen.add(profile.id); members.push(profile);
    }
    const { data: productRows, error: productError } = await db.from('dao_products')
      .select('id,name,description,image_url,price_rep,is_token_gated,created_at')
      .eq('community_id', row.id).order('created_at', { ascending: false }).limit(48);
    if (productError || !Array.isArray(productRows)) return unavailable(503);
    const products = productRows.map(product => ({ id: product.id, name: product.name, description: product.description,
      image_url: product.image_url, price_rep: product.price_rep, is_token_gated: product.is_token_gated, created_at: product.created_at }));
    return privateJson({ community, contracts: { governance: contract('governance'), infrastructure: contract('infrastructure') },
      members, products,
      // Public publication data cannot establish a viewer's management authority.
      // A separate verified capability can restore these optional controls later.
      viewer: { canManage: false } });
  } catch {
    return unavailable(503);
  }
}
