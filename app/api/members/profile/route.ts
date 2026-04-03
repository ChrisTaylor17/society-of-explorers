import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { memberId, display_name, bio, discipline, skills, project_description, seeking, philosophy } = await req.json();
    if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

    const skillsArr = typeof skills === 'string'
      ? skills.split(',').map((s: string) => s.trim()).filter(Boolean)
      : skills || null;

    const { error } = await supabaseAdmin.from('members').update({
      display_name: display_name || null,
      bio: bio || null,
      discipline: discipline || null,
      skills: skillsArr,
      project_description: project_description || null,
      seeking: seeking || null,
      philosophy: philosophy || null,
    }).eq('id', memberId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
