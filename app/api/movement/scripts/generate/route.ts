import { NextRequest } from 'next/server';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { buildCreatorOpsReceipt } from '@/lib/movement/creatorOpsReceipts';
import { generateScripts, getLatestQuestionId } from '@/lib/movement/scriptgen';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { questionId?: unknown; latest?: unknown };
    const questionId =
      typeof body.questionId === 'string' && body.questionId
        ? body.questionId
        : body.latest === true
          ? await getLatestQuestionId()
          : null;
    if (!questionId) return privateJson({ error: 'questionId or latest=true required' }, { status: 400 });

    const scripts = await generateScripts(questionId);
    return privateJson({
      questionId,
      scripts,
      creatorReceipt: buildCreatorOpsReceipt({
        action: 'generate_drafts',
        generatedAt: new Date().toISOString(),
        recordScope: 'movement_scripts + utm_links',
        itemCount: scripts.length,
        detail: 'Generated local draft scripts and draft UTM links only. No publish, send, schedule, or paid promotion was triggered.',
      }),
    });
  } catch {
    return internalRouteError('Script generation failed');
  }
}
