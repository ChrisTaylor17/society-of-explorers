export const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export const PROJECT_LIST_SELECT =
  'id,title,short_description,description,category,funding_goal,amount_raised,backer_count,status';

export const PROJECT_DETAIL_SELECT =
  `${PROJECT_LIST_SELECT},proposer_name,use_of_funds,milestones,update_log,created_at`;

export type PublicProject = {
  id: string;
  title: string;
  short_description: string | null;
  description: string;
  category: string;
  funding_goal: number;
  amount_raised: number;
  backer_count: number;
  status: string;
};

export type PublicProjectDetail = PublicProject & {
  proposer_name: string | null;
  use_of_funds: string | null;
  milestones: Array<{ title: string; description: string; status: string }>;
  update_log: Array<{ title?: string; body?: string; date?: string }>;
  created_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function nullableText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function numberField(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function integerField(value: unknown) {
  return Math.floor(numberField(value));
}

function sanitizeMilestones(value: unknown): PublicProjectDetail['milestones'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .slice(0, 25)
    .map((milestone) => ({
      title: text(milestone.title, 'Milestone', 120),
      description: text(milestone.description, '', 1_200),
      status: text(milestone.status, 'pending', 40),
    }));
}

function sanitizeUpdateLog(value: unknown): PublicProjectDetail['update_log'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .slice(0, 25)
    .map((update) => ({
      ...(nullableText(update.title, 120) ? { title: nullableText(update.title, 120) || undefined } : {}),
      ...(nullableText(update.body, 2_000) ? { body: nullableText(update.body, 2_000) || undefined } : {}),
      ...(nullableText(update.date, 40) ? { date: nullableText(update.date, 40) || undefined } : {}),
    }));
}

export function sanitizeProjectListRow(row: unknown): PublicProject | null {
  if (!isRecord(row) || typeof row.id !== 'string' || !PROJECT_ID_PATTERN.test(row.id)) return null;

  return {
    id: row.id,
    title: text(row.title, 'Untitled project', 160),
    short_description: nullableText(row.short_description, 240),
    description: text(row.description, '', 5_000),
    category: text(row.category, 'general', 80),
    funding_goal: numberField(row.funding_goal),
    amount_raised: numberField(row.amount_raised),
    backer_count: integerField(row.backer_count),
    status: text(row.status, 'active', 80),
  };
}

export function sanitizeProjectDetailRow(row: unknown): PublicProjectDetail | null {
  const base = sanitizeProjectListRow(row);
  if (!base || !isRecord(row)) return null;

  return {
    ...base,
    proposer_name: nullableText(row.proposer_name, 160),
    use_of_funds: nullableText(row.use_of_funds, 2_000),
    milestones: sanitizeMilestones(row.milestones),
    update_log: sanitizeUpdateLog(row.update_log),
    created_at: nullableText(row.created_at, 80),
  };
}
