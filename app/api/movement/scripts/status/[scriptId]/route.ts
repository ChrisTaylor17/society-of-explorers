import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { buildCreatorOpsReceipt } from '@/lib/movement/creatorOpsReceipts';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ALLOWED_STATUSES = ['draft', 'approved', 'published', 'archived'] as const;
const MOVEMENT_SCRIPT_STATUS_SELECT = 'id, status, published_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];
type StatusBody = Record<string, unknown>;
type MovementScriptStatusRow = {
  id: string | null;
  status: string | null;
  published_at: string | null;
};

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return typeof value === 'string' && ALLOWED_STATUSES.includes(value as AllowedStatus);
}

function isRecord(value: unknown): value is StatusBody {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<StatusBody | null> {
  try {
    const parsed = await req.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function publicScriptStatusReceipt(row: MovementScriptStatusRow) {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    status: isAllowedStatus(row.status) ? row.status : 'draft',
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
  };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ scriptId: string }> },
) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

    const { scriptId } = await context.params;
    if (!UUID_RE.test(scriptId)) return privateJson({ error: 'Invalid scriptId' }, { status: 400 });

    const body = await safeRequestJson(req);
    if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

    if (!isAllowedStatus(body.status)) {
      return privateJson({ error: 'Valid status required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('movement_scripts')
      .update({ status: body.status })
      .eq('id', scriptId)
      .select(MOVEMENT_SCRIPT_STATUS_SELECT)
      .single();

    if (error || !data) return privateJson({ error: 'Script status update failed' }, { status: 500 });

    return privateJson({
      script: publicScriptStatusReceipt(data),
      creatorReceipt: buildCreatorOpsReceipt({
        action: 'status_change',
        generatedAt: new Date().toISOString(),
        recordScope: 'movement_scripts.status',
        detail: `Changed local script status metadata to ${body.status}. No publish, send, schedule, or paid promotion was triggered.`,
      }),
    });
  } catch {
    return privateJson({ error: 'Script status update failed' }, { status: 500 });
  }
}
