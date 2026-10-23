import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const PROJECT_CATEGORIES = new Set(['general', 'physical', 'technology', 'education', 'art', 'community']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FUNDING_GOAL = 10000;
const MIN_FUNDING_GOAL = 100;
const MAX_FUNDING_GOAL = 500000;

type ProjectSubmissionBody = {
  title?: unknown;
  short_description?: unknown;
  description?: unknown;
  category?: unknown;
  funding_goal?: unknown;
  name?: unknown;
  email?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<ProjectSubmissionBody | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase().slice(0, 254);
  return EMAIL_PATTERN.test(email) ? email : '';
}

function normalizeCategory(value: unknown) {
  const category = boundedText(value, 40).toLowerCase();
  return PROJECT_CATEGORIES.has(category) ? category : 'general';
}

function normalizeFundingGoal(value: unknown) {
  const rawValue = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(rawValue)) return DEFAULT_FUNDING_GOAL;
  return Math.max(MIN_FUNDING_GOAL, Math.min(Math.trunc(rawValue), MAX_FUNDING_GOAL));
}

function projectLeadEmailNotificationsEnabled() {
  return process.env.PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendProjectSubmissionNotification(input: {
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  fundingGoal: number;
  name: string;
  email: string;
}) {
  if (!projectLeadEmailNotificationsEnabled()) return;

  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: 'chris@societyofexplorers.com',
      subject: `New Project Submission: ${input.title}`,
      html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
        <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">PROJECT SUBMISSION</div>
        <p><strong style="color:#c9a84c;">Title:</strong> ${escapeHtml(input.title)}</p>
        <p><strong style="color:#c9a84c;">Category:</strong> ${escapeHtml(input.category)}</p>
        <p><strong style="color:#c9a84c;">Goal:</strong> $${input.fundingGoal.toLocaleString()}</p>
        <p><strong style="color:#c9a84c;">Name:</strong> ${escapeHtml(input.name)}</p>
        <p><strong style="color:#c9a84c;">Email:</strong> ${escapeHtml(input.email)}</p>
        ${
          input.shortDescription
            ? `<p><strong style="color:#c9a84c;">Summary:</strong> ${escapeHtml(input.shortDescription)}</p>`
            : ''
        }
        <p><strong style="color:#c9a84c;">Description:</strong> ${escapeHtml(input.description.slice(0, 500))}</p>
      </div>`,
    });
  } catch {
    console.warn('[projects/submit] notification email skipped');
  }
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);

  if (!body) {
    return privateJson({ error: 'Invalid body' }, { status: 400 });
  }

  const title = boundedText(body.title, 120);
  const shortDescription = boundedText(body.short_description, 180);
  const description = boundedText(body.description, 3000);
  const category = normalizeCategory(body.category);
  const fundingGoal = normalizeFundingGoal(body.funding_goal);
  const name = boundedText(body.name, 120);
  const email = normalizeEmail(body.email);

  if (!title || !description || !name || !email) {
    return privateJson({ error: 'Title, description, name, and email are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('projects').insert({
    title,
    short_description: shortDescription || null,
    description,
    category,
    funding_goal: fundingGoal,
    status: 'pending',
    proposer_name: name,
    proposer_email: email,
  });

  if (error) {
    console.warn('[projects/submit] project insert failed');
    return privateJson({ error: 'Failed to submit project' }, { status: 500 });
  }

  await sendProjectSubmissionNotification({
    title,
    shortDescription,
    description,
    category,
    fundingGoal,
    name,
    email,
  });

  return privateJson({ success: true });
}
