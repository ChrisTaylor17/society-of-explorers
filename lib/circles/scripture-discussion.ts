import { getScriptureStudy, type ScriptureStudyId } from '@/lib/root-kernel/scripture-studies';
import { discussionHref } from './thread';

export function getScriptureDiscussion(value: unknown) {
  const study = getScriptureStudy(value);
  if (!study) return undefined;
  const { before, verse, after } = study.questions[0];
  // Keep the same editable prompt within the Quest controller keyboard's character set.
  const question = (before + 'verse ' + verse + after).replaceAll('’', "'");
  const href = study.href + '#verse-' + verse;
  return { id: study.id, title: study.work.title, question, href, draft: question + '\n\n' + href };
}

export function scriptureDiscussionHref(circleId: string, study: ScriptureStudyId): string {
  return discussionHref(circleId) + '?' + new URLSearchParams({ study });
}
