import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';

export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const resend = new Resend(process.env.RESEND_API_KEY!);

const THINKERS = [
  { id: 'socrates', name: 'Socrates' },
  { id: 'nietzsche', name: 'Nietzsche' },
  { id: 'aurelius', name: 'Marcus Aurelius' },
  { id: 'einstein', name: 'Einstein' },
  { id: 'plato', name: 'Plato' },
  { id: 'jobs', name: 'Steve Jobs' },
];

function pickThinker() {
  return THINKERS[Math.floor(Math.random() * THINKERS.length)];
}

async function generateProvocation(thinkerName: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: `You are ${thinkerName}. Write a 2-3 sentence provocation — a question or challenge that makes someone stop and think about their life. Be direct, modern, personal. No archaic language.`,
    messages: [{ role: 'user', content: 'Give me your provocation for this week.' }],
  });
  const block = msg.content[0];
  return block.type === 'text' ? block.text : '';
}

function buildEmailHtml(thinkerName: string, thinkerId: string, provocation: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 0 32px;text-align:center;">
          <span style="font-family:Georgia,serif;font-size:9px;letter-spacing:0.4em;color:#c9a84c;">SOCIETY OF EXPLORERS</span>
        </td></tr>
        <tr><td style="padding:0 0 32px;"><div style="height:1px;background:rgba(201,168,76,0.2);"></div></td></tr>
        <tr><td style="padding:0 0 16px;text-align:center;">
          <span style="font-family:Georgia,serif;font-size:11px;letter-spacing:0.2em;color:#c9a84c;">${thinkerName.toUpperCase()}</span>
        </td></tr>
        <tr><td style="padding:0 24px 32px;text-align:center;">
          <p style="font-family:Georgia,serif;font-size:20px;line-height:1.8;color:#f5f0e8;margin:0;font-style:italic;">
            ${provocation}
          </p>
        </td></tr>
        <tr><td style="padding:0 0 40px;text-align:center;">
          <a href="https://www.societyofexplorers.com/salon?thinker=${thinkerId}" style="display:inline-block;font-family:Georgia,serif;font-size:10px;letter-spacing:0.18em;color:#0a0a0a;background:#c9a84c;padding:14px 28px;text-decoration:none;">
            CONTINUE THIS CONVERSATION
          </a>
        </td></tr>
        <tr><td style="padding:0 0 24px;"><div style="height:1px;background:rgba(201,168,76,0.1);"></div></td></tr>
        <tr><td style="text-align:center;padding:0 0 8px;">
          <span style="font-family:Georgia,serif;font-size:12px;color:rgba(245,240,232,0.4);">
            You're receiving this because you're a member of the Society of Explorers.
          </span>
        </td></tr>
        <tr><td style="text-align:center;">
          <a href="https://www.societyofexplorers.com/dashboard" style="font-family:Georgia,serif;font-size:11px;color:rgba(201,168,76,0.4);text-decoration:underline;">
            Unsubscribe
          </a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const thinker = pickThinker();
    const provocation = await generateProvocation(thinker.name);

    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: 'chris@societyofexplorers.com',
      subject: `${thinker.name} has a question for you`,
      html: buildEmailHtml(thinker.name, thinker.id, provocation),
    });

    console.log(`Test provocation sent: ${thinker.name} → chris@societyofexplorers.com`);
    return NextResponse.json({ success: true, sent: 1, thinker: thinker.name, provocation });
  } catch (err) {
    console.error('Test provocation error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
