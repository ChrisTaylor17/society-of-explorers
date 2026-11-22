import { NextRequest } from 'next/server';
import { createAnthropicClient, logClaudeUsage, resolveClaudeModel } from '@/lib/ai/anthropic';
import { buildSystemPrompt } from '@/lib/claude/thinkers';
import { getReviewedGuideContext } from '@/lib/memory/reviewRuntime';
import { GUIDE_ACTION_NOTICE, GUIDE_RESPONSE_RULES } from '@/lib/claude/guidePolicy';
import { createGuideTextStream, GUIDE_ACTION_MARKER } from '@/lib/claude/guideTextStream';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { limitModelCall } from '@/lib/rateLimit';
import { memberCanUseSharedSalon } from '@/lib/salons/access';
import { getCommunityThinkerPrompts } from '@/lib/community/getCommunity';
import { checkPermission } from '@/lib/governance/hats';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createHash } from 'node:crypto';
import { isUuid } from '@/lib/ids/uuid';
import { authWriteOriginAllowed } from '@/lib/auth/request';
import { parseThinkerRewardReceipt, type ThinkerRewardReceipt } from '@/lib/rewards/thinker';

const DIRECT_MAX_TOKENS = 600;
const COUNCIL_MAX_TOKENS = 800;
const ARTIFACT_MAX_TOKENS = 1200;
const REACTION_MAX_TOKENS = 80;
const HISTORY_LIMIT = 14;

const ARTIFACT_KEYWORDS = ['draft', 'write', 'plan', 'outline', 'create', 'build', 'design', 'manifesto', 'pitch', 'letter', 'framework', 'strategy', 'proposal'];

interface MemberContextProfile {
  id?: string;
  display_name?: string | null;
  bio?: string | null;
  discipline?: string | null;
  skills?: string[] | null;
  project_description?: string | null;
  seeking?: string | null;
  philosophy?: string | null;
  exp_tokens?: number | null;
}

interface ThinkerRequestBody {
  requestId?: string;
  demo?: boolean;
  thinkerId?: string;
  thinker?: string;
  message?: string;
  isReaction?: boolean;
  salonId?: string;
  isCouncilMode?: boolean;
  councilContext?: { thinker: string; response: string }[];
  community?: string;
}

async function boundedRewardCall<T>(work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(work), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Reward result unconfirmed')), 8_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

// Confirmation only: no model call, event insert, or credit retry. An absent
// receipt cannot prove that a different in-flight transaction will not commit.
export async function GET(req: NextRequest) {
  try {
    if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Forbidden' }, { status: 403 });
    const query = new URL(req.url).searchParams;
    if (query.size !== 1 || !isUuid(query.get('requestId'))) return privateJson({ error: 'Use a valid requestId' }, { status: 400 });
    const requestId = query.get('requestId')!.toLowerCase();
    const actor = await getAuthenticatedMember(req);
    if (!actor) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await boundedRewardCall(getSupabaseAdmin().rpc('soe_thinker_reward_receipt', {
      p_actor: actor.memberId, p_request_id: requestId,
    }));
    if (error) return privateJson({ requestId, status: 'unknown' }, { status: 503 });
    if (data === null) return privateJson({ requestId, status: 'unknown' });
    const receipt = parseThinkerRewardReceipt(data);
    if (!receipt || receipt.requestId !== requestId || !receipt.replayed) return privateJson({ requestId, status: 'unknown' }, { status: 503 });
    return privateJson({ status: 'confirmed', ...receipt });
  } catch { return privateJson({ status: 'unknown' }, { status: 503 }); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function normalizeCouncilContext(value: unknown): { thinker: string; response: string }[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 8)
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const thinker = textField(entry.thinker, 80);
      const response = textField(entry.response, 4_000);
      return thinker && response ? { thinker, response } : null;
    })
    .filter((entry): entry is { thinker: string; response: string } => Boolean(entry));
}

function privateSseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate, no-transform',
    Pragma: 'no-cache',
    Expires: '0',
    Connection: 'keep-alive',
    Vary: 'Cookie, Authorization',
    'X-Content-Type-Options': 'nosniff',
  };
}

function reportThinkerRouteFailure(scope: string) {
  console.warn(`[thinker] ${scope} failed`);
}

function isArtifactRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return ARTIFACT_KEYWORDS.some(kw => lower.includes(kw));
}

function buildMemberContext(m: MemberContextProfile): string {
  let name = 'Explorer';
  if (m.display_name && !m.display_name.startsWith('0x')) {
    name = m.display_name;
  } else if (m.display_name?.startsWith('0x')) {
    name = `Explorer (wallet ${m.display_name.slice(0, 6)}...)`;
  }
  return [
    `The member speaking is ${name}. Address them by name.`,
    m.bio ? `Bio: ${m.bio}` : null,
    m.discipline ? `Discipline: ${m.discipline}` : null,
    m.skills?.length ? `Skills: ${m.skills.join(', ')}` : null,
    m.project_description ? `Building: ${m.project_description}` : null,
    m.seeking ? `Seeking: ${m.seeking}` : null,
    m.philosophy ? `Philosophy: ${m.philosophy}` : null,
  ].filter(Boolean).join('\n');
}

export async function POST(req: NextRequest) {
  try {
    if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Forbidden' }, { status: 403 });
    if (new URL(req.url).searchParams.size) return privateJson({ error: 'Invalid query' }, { status: 400 });
    const parsed = await safeRequestJson(req);
    if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

    const body = parsed as ThinkerRequestBody;
    if (body.demo === true) {
      return privateJson({ error: 'The guest Thinker chat has closed. Open the Apology guide on the homepage.' }, { status: 410 });
    }
    let supabaseAdminClient: ReturnType<typeof getSupabaseAdmin> | null = null;
    const supabaseAdmin = () => {
      supabaseAdminClient ??= getSupabaseAdmin();
      return supabaseAdminClient;
    };

    const thinkerId = textField(body.thinkerId, 80) ?? textField(body.thinker, 80);
    const message = textField(body.message, 8_000);
    const isReaction = body.isReaction === true;
    const requestedSalonId = textField(body.salonId, 120);
    const councilContext = normalizeCouncilContext(body.councilContext);
    const communitySlug = textField(body.community, 120) ?? 'society-of-explorers';

    if (!thinkerId || !message) {
      return privateJson({ error: 'thinkerId and message are required' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth?.memberId) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    const { memberId, member } = auth;
    const memberName = member.display_name;
    const isCouncilMode = body.isCouncilMode === true;
    // A missing destination must never turn a private request into a shared post.
    if (!isCouncilMode && !requestedSalonId) {
      return privateJson({ error: 'A salonId is required' }, { status: 400 });
    }
    const salonId = requestedSalonId ?? 'council';
    const isOwnPrivateSalon = !isCouncilMode && salonId === `private-${memberId}`;

    // Apply the member's server-side budget before any model call.
    const limited = limitModelCall(req, memberId);
    if (limited) return limited;

    // Security fix S2b: salon mode reads and writes salon history, so the salon must be the caller's own
    // private salon, 'general', or a salon they guide or belong to. Council doesn't touch salon history.
    if (!isCouncilMode && salonId !== `private-${memberId}`) {
      if (salonId.startsWith('private-') || !(await memberCanUseSharedSalon(supabaseAdmin(), memberId, salonId))) {
        return privateJson({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Permission check for non-default communities
    if (communitySlug !== 'society-of-explorers') {
      const canUseCouncil = await checkPermission(memberId, communitySlug, 'use_council');
      if (!canUseCouncil) {
        return privateJson({ error: 'You do not have council access in this community' }, { status: 403 });
      }
    }

    if (!isUuid(body.requestId)) {
      return privateJson({ error: 'A logical requestId UUID is required' }, { status: 400 });
    }
    const requestId = body.requestId.toLowerCase();
    const requestHash = createHash('sha256').update(JSON.stringify([
      'thinker-reward-v1', thinkerId, message, isReaction, salonId, isCouncilMode, councilContext, communitySlug,
    ])).digest('hex');

    const isSystemPrompt = message.startsWith('A member recorded a 15-second Waddle') ||
      message.startsWith('You have been invited into a private conversation') ||
      message.startsWith('Here are my current tasks:') ||
      (message.includes('Respond as ') && message.includes(' — in character, direct'));

    // --- FETCH MESSAGE HISTORY ---
    // Council mode: skip history fetch — use only the current message + councilContext (injected in system prompt)
    // Read prior salon history before inserting this question. The current input
    // is supplied directly, independent of persistence or interleaved messages.
    let conversationHistory: { role: 'user' | 'assistant'; content: string }[];

    if (isCouncilMode) {
      // Council: just the current user message. Council context is already in the system prompt.
      conversationHistory = [{ role: 'user', content: message }];
    } else {
      const { data: history, error: historyError } = await supabaseAdmin()
        .from('salon_messages')
        .select('content, sender_type, thinker_id')
        .eq('salon_id', salonId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT - 1);

      if (historyError) {
        reportThinkerRouteFailure('conversation history');
        return privateJson({ error: 'Conversation history unavailable' }, { status: 503 });
      }

      conversationHistory = (history || [])
        .reverse()
        .map((msg) => ({
          role: msg.sender_type === 'member' ? 'user' as const : 'assistant' as const,
          content: msg.thinker_id && msg.sender_type === 'thinker'
            ? `[${msg.thinker_id}]: ${msg.content}`
            : msg.content,
        }));
      conversationHistory.push({ role: 'user', content: message });
    }

    // Preserve generated-context exclusion from the member-message log. It must
    // still reach the model even though it is not inserted as a chat message.
    if (!isCouncilMode && !isSystemPrompt) {
      const { error: userMsgError } = await supabaseAdmin().from('salon_messages').insert({
        salon_id: salonId,
        sender_type: 'member',
        sender_name: memberName || 'Explorer',
        thinker_id: null,
        content: message,
      });
      if (userMsgError) reportThinkerRouteFailure('member message save');
    }

    // --- BUILD COMPLETE COMPACT PROMPT (never slice away persona or rules) ---
    let systemPrompt = buildSystemPrompt(thinkerId, { compact: true });
    if (isCouncilMode) {
      // Keep the compact persona as fallback; only query custom communities.
      if (communitySlug !== 'society-of-explorers') {
        try {
          const communityPrompts = await getCommunityThinkerPrompts(communitySlug);
          systemPrompt = communityPrompts[thinkerId] || systemPrompt;
        } catch {
          // The complete compact default remains available.
        }
      }
      systemPrompt += '\n\nCOUNCIL MODE: Reply in 2 or 3 short sentences, at most 60 words in all, and finish on a complete sentence. Offer one practical next step and engage fairly with other perspectives.';

      // Inject what other thinkers said
      if (councilContext && councilContext.length > 0) {
        systemPrompt += '\n\nOther thinkers already said:\n' +
          councilContext.map(c => c.thinker + ': ' + c.response).join('\n') +
          "\n\nDon't repeat them. Build on them or disagree.";
      }
    }

    let maxTokens: number;
    if (isReaction) {
      maxTokens = REACTION_MAX_TOKENS;
    } else if (isArtifactRequest(message)) {
      maxTokens = ARTIFACT_MAX_TOKENS;
    } else if (councilContext.length > 0) {
      maxTokens = COUNCIL_MAX_TOKENS;
    } else {
      maxTokens = DIRECT_MAX_TOKENS;
    }

    let fullSystemPrompt = systemPrompt;

    if (isCouncilMode) {
      // Council mode: FAST PATH — system prompt is already built above.
      // Only add member name if available.
      if (memberName && !memberName.startsWith('0x')) {
        fullSystemPrompt += `\n\nThe member's name is ${memberName}. Use it only if it reads like a real first name, and at most once.`;
      }
    } else {
      const usableName = (memberName && !memberName.startsWith('0x')) ? memberName : null;
      const contextPrefix = isOwnPrivateSalon
        ? buildMemberContext(member)
        : (usableName ? `The member speaking is ${usableName}.` : 'A member is speaking.');

      fullSystemPrompt += `\n\n${contextPrefix}`;
      if (!isOwnPrivateSalon) {
        fullSystemPrompt += '\n\nThis answer is for a shared salon. Personal context is limited to what members have explicitly shared in this salon or the current message. Do not claim to remember private conversations.';
      }
      if (usableName) {
        fullSystemPrompt += `\n\nIMPORTANT: The member's name is ${usableName}. If it reads like a real first name, you may use it once; if it looks like a username or handle, don't use it. Never call them "Anonymous Explorer" or just "Explorer."`;
      }

      if (isReaction) {
        fullSystemPrompt += '\n\nYou are reacting to what another thinker just said. Keep your reaction to 1-2 sentences. Be substantive — agree, disagree, or build on their point. No pleasantries.';
      }

      if (councilContext.length > 0) {
        const ctxLines = councilContext.map(c => `[${c.thinker} said]: "${c.response}"`).join('\n');
        fullSystemPrompt += `\n\nCOUNCIL SESSION — Other thinkers have already responded to this question:\n${ctxLines}\n\nYou may engage with, challenge, or build on their ideas. Be direct. Name them by name. Don't repeat what they said — add your distinct perspective or push back. Keep your response to 2 or 3 short sentences.`;
      }
    }

    // Final authority guidance is appended after fresh reviewed context for each attempt.

    // --- STREAM RESPONSE ---
    const claudePurpose = isCouncilMode ? 'council' : 'default';
    const claudeModel = resolveClaudeModel(claudePurpose);
    const anthropic = createAnthropicClient();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = '';
          let rewardReceipt: ThinkerRewardReceipt | null = null;
          const guideText = createGuideTextStream();
          const sendText = (text: string) => {
            if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          };

          // One explicit retry is allowed only before output. Disable nested SDK
          // retries so this loop controls the number of HTTP attempts.
          let lastErr: unknown = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              if (req.signal.aborted) throw new Error('Request cancelled');
              // A retry is a new provider transmission. Re-read current consent and
              // source eligibility so revoked notes are never reused from attempt one.
              let attemptSystemPrompt = fullSystemPrompt;
              if (isOwnPrivateSalon) {
                try {
                  const reviewedContext = await getReviewedGuideContext(memberId, thinkerId);
                  if (reviewedContext) attemptSystemPrompt += `\n\n${reviewedContext}`;
                } catch { reportThinkerRouteFailure('reviewed memory retrieval'); }
              }
              attemptSystemPrompt += '\n\n' + GUIDE_RESPONSE_RULES;
              if (req.signal.aborted) throw new Error('Request cancelled');
              const claudeStartedAt = Date.now();
              const anthropicStream = anthropic.messages.stream({
                model: claudeModel,
                max_tokens: maxTokens,
                system: attemptSystemPrompt,
                messages: conversationHistory,
              }, { maxRetries: 0, signal: req.signal });

              anthropicStream.on('text', (text) => {
                fullText += text;
                sendText(guideText.push(text));
              });

              const finalMessage = await anthropicStream.finalMessage();
              logClaudeUsage({
                purpose: claudePurpose,
                model: claudeModel,
                operation: 'messages.stream',
                latencyMs: Date.now() - claudeStartedAt,
                usage: finalMessage.usage,
              });
              lastErr = null;
              break; // success
            } catch (apiErr: unknown) {
              lastErr = apiErr;
              reportThinkerRouteFailure('provider stream attempt');
              // A new attempt would append a different answer to partial output.
              if (req.signal.aborted || fullText.length > 0) throw apiErr;
              if (attempt === 0) await new Promise(r => setTimeout(r, 2000)); // wait before retry
            }
          }
          if (lastErr) throw lastErr;
          sendText(guideText.finish());

          if (fullText.trim().toUpperCase().startsWith('SILENT')) {
            const doneData = JSON.stringify({ done: true, response: '', silent: true });
            controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
            controller.close();
            return;
          }

          // Legacy action JSON is untrusted model output, never authorization.
          // Do not parse or forward it for execution, even if it is malformed.
          const actionStart = fullText.indexOf(GUIDE_ACTION_MARKER);
          const actionReviewRequired = actionStart !== -1;
          const replyText = actionReviewRequired ? fullText.slice(0, actionStart) : fullText;
          let cleanText = replyText
            .replace(/^\[[\w-]+\]:\s*/i, '')
            .replace(/^\[[\w-]+\]\s*/i, '')
            .replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs|steve-jobs):\s*/i, '')
            .trim();

          if (actionReviewRequired) cleanText = [cleanText, GUIDE_ACTION_NOTICE].filter(Boolean).join('\n\n');

          const thinkerDisplayNames: Record<string, string> = {
            socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche',
            aurelius: 'Aurelius', einstein: 'Einstein', jobs: 'Jobs',
          };
          const thinkerName = thinkerDisplayNames[thinkerId] || thinkerId;
          if (!isCouncilMode) {
            const { error: saveError } = await supabaseAdmin().from('salon_messages').insert({
              salon_id: salonId,
              sender_type: 'thinker',
              sender_name: thinkerName,
              thinker_id: thinkerId,
              content: cleanText,
            });
            if (saveError) reportThinkerRouteFailure('thinker message save');
          }

          if (actionReviewRequired) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'actions', results: [
              { type: 'review_required', success: false, message: GUIDE_ACTION_NOTICE },
            ] })}\n\n`));
          }

          try {
            const { data, error } = await boundedRewardCall(supabaseAdmin().rpc('soe_thinker_reward_award', {
              p_actor: memberId, p_request_id: requestId, p_request_hash: requestHash,
              p_thinker_id: thinkerId, p_is_reaction: isReaction,
            }));
            const receipt = !error ? parseThinkerRewardReceipt(data) : null;
            if (receipt && receipt.requestId === requestId && receipt.amount === (isReaction ? 4 : 8)) rewardReceipt = receipt;
            else reportThinkerRouteFailure('reward confirmation');
          } catch { reportThinkerRouteFailure('reward confirmation'); }

          // Ordinary conversation and rewards do not grant durable-memory consent.
          // Reviewed memory is prepared and saved only through the separate review flow.

          const doneData = JSON.stringify({
            done: true,
            response: cleanText,
            ...(rewardReceipt ? { expAwarded: rewardReceipt.replayed ? 0 : rewardReceipt.amount } : {}),
            reward: rewardReceipt ? { status: 'confirmed', ...rewardReceipt } : { status: 'unknown', requestId },
            ...(actionReviewRequired ? { actionReview: { status: 'not_executed' } } : {}),
          });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
          controller.close();
        } catch {
          reportThinkerRouteFailure('stream');
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed', done: true })}\n\n`));
            controller.close();
          } catch {
            try { controller.close(); } catch {}
          }
        }
      },
    });

    return new Response(stream, {
      headers: privateSseHeaders(),
    });
  } catch {
    reportThinkerRouteFailure('request');
    return privateJson({ error: 'Internal server error' }, { status: 500 });
  }
}
