import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Fetch all salon proposals and supports
    const { data: rows } = await supabase
      .from('founding_interest')
      .select('why')
      .or('why.ilike.%Salon Proposal%,why.ilike.%Salon Support%');

    if (!rows || rows.length === 0) {
      return NextResponse.json({ cities: [] });
    }

    const cityMap: Record<string, { proposals: number; supports: number }> = {};

    for (const row of rows) {
      const why = row.why || '';

      // Parse "[Salon Proposal] CityName: reason" or "[Salon Proposal] CityName"
      const proposalMatch = why.match(/\[Salon Proposal\]\s*([^:]+)/);
      if (proposalMatch) {
        const city = proposalMatch[1].trim();
        if (!cityMap[city]) cityMap[city] = { proposals: 0, supports: 0 };
        cityMap[city].proposals++;
        continue;
      }

      // Parse "[Salon Support] CityName"
      const supportMatch = why.match(/\[Salon Support\]\s*(.+)/);
      if (supportMatch) {
        const city = supportMatch[1].trim();
        if (!cityMap[city]) cityMap[city] = { proposals: 0, supports: 0 };
        cityMap[city].supports++;
      }
    }

    const cities = Object.entries(cityMap)
      .map(([name, counts]) => ({
        name,
        proposalCount: counts.proposals,
        supportCount: counts.supports,
        totalSupport: counts.proposals + counts.supports,
      }))
      .sort((a, b) => b.totalSupport - a.totalSupport);

    return NextResponse.json({ cities });
  } catch (err) {
    console.error('Salon cities error:', err);
    return NextResponse.json({ cities: [] });
  }
}
