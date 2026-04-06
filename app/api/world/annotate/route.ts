import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { spaceId, scanId, authorId, memberId, content, annotationType, positionX, positionY, positionZ } = await req.json();

    if (!spaceId || !authorId || !memberId || !content) {
      return NextResponse.json({ error: 'Missing required fields: spaceId, authorId, memberId, content' }, { status: 400 });
    }

    // Verify space exists
    const { data: space } = await supabaseAdmin
      .from('spaces')
      .select('id')
      .eq('id', spaceId)
      .single();

    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    // Create annotation (White Knight Pen)
    const { data: annotation, error } = await supabaseAdmin
      .from('spatial_annotations')
      .insert({
        space_id: spaceId,
        scan_id: scanId || null,
        author_id: authorId,
        content,
        annotation_type: annotationType || 'note',
        position_x: positionX ?? null,
        position_y: positionY ?? null,
        position_z: positionZ ?? null,
        exp_awarded: 3,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Award 3 EXP for annotation
    await supabaseAdmin.from('exp_events').insert({
      member_id: memberId,
      amount: 3,
      reason: 'spatial_annotation',
      metadata: JSON.stringify({ annotationId: annotation.id, spaceId, type: annotationType || 'note' }),
    });

    const { data: member } = await supabaseAdmin
      .from('members')
      .select('exp_tokens')
      .eq('id', memberId)
      .single();

    const newTotal = (member?.exp_tokens || 0) + 3;
    await supabaseAdmin.from('members').update({ exp_tokens: newTotal }).eq('id', memberId);

    return NextResponse.json({ annotation, expAwarded: 3, newTotal });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
