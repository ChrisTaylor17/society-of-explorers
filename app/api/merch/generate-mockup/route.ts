import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Runway ML API — async task-based.
// Docs: https://docs.runwayml.com/docs/api-reference
//
// Flow:
//   1. POST /v1/text_to_image  → { id: taskId, status: "PENDING" }
//   2. Poll GET /v1/tasks/{id} → until status "SUCCEEDED" or "FAILED"
//   3. Output URL in response.output[0]

const RUNWAY_BASE = 'https://api.runwayml.com/v1';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 90_000; // 90s max — Vercel function limit is 5min on hobby, 10min on pro

async function runwayRequest(path: string, options: RequestInit = {}) {
  const apiKey = process.env.RUNWAY_API_KEY;
  return fetch(`${RUNWAY_BASE}${path}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-09-13',
      ...(options.headers ?? {}),
    },
  });
}

async function pollTask(taskId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res  = await runwayRequest(`/tasks/${taskId}`);
    const data = await res.json();
    if (data.status === 'SUCCEEDED') {
      const url = data.output?.[0];
      if (!url) throw new Error('Runway returned SUCCEEDED but no output URL');
      return url;
    }
    if (data.status === 'FAILED') {
      throw new Error(`Runway task failed: ${data.failure ?? data.failureCode ?? 'unknown reason'}`);
    }
    // PENDING or RUNNING — keep polling
  }
  throw new Error('Runway task timed out after 90s');
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'RUNWAY_API_KEY not configured' }, { status: 503 });
  }

  let body: { visual_brief: string; suggestionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { visual_brief, suggestionId } = body;
  if (!visual_brief) {
    return NextResponse.json({ error: 'visual_brief is required' }, { status: 400 });
  }

  // Build a focused product mockup prompt from the visual brief
  const prompt = [
    'Society of Explorers product mockup, dark background, gold accents,',
    'luxury philosophical aesthetic, clean product photography,',
    visual_brief.slice(0, 400), // Runway prompt limit ~1000 chars but keep focused
  ].join(' ');

  // Step 1: Create the text-to-image task
  let taskId: string;
  try {
    const createRes  = await runwayRequest('/text_to_image', {
      method: 'POST',
      body: JSON.stringify({
        model:      'gen3a_turbo',
        promptText: prompt,
        width:      1024,
        height:     1024,
        ratio:      '1:1',
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error('Runway create error:', createData);
      return NextResponse.json(
        { error: createData?.error ?? createData?.message ?? 'Runway API error' },
        { status: createRes.status },
      );
    }
    taskId = createData.id;
  } catch (err) {
    console.error('Runway network error:', err);
    return NextResponse.json({ error: 'Could not reach Runway API' }, { status: 502 });
  }

  // Step 2: Poll for completion
  let imageUrl: string;
  try {
    imageUrl = await pollTask(taskId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Runway generation failed';
    console.error('Runway poll error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Step 3: Persist image_url to the suggestion row (if provided)
  if (suggestionId) {
    const supabase = createServiceClient();
    const { error: dbErr } = await supabase
      .from('merch_suggestions')
      .update({ image_url: imageUrl })
      .eq('id', suggestionId);
    if (dbErr) console.error('DB update after Runway:', dbErr.message);
  }

  return NextResponse.json({ success: true, image_url: imageUrl, task_id: taskId });
}
