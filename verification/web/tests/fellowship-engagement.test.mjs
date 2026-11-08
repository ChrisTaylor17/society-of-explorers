import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';
import { ROOM_POST_LIMIT, roomReviewText } from '../../../platforms/quest/room-composer.mjs';

const topics = sourceLoader()('lib/fellowship/topics.ts');
const circleId = '01234567-aaaa-4abc-8abc-123456789abc';
const plain = value => JSON.parse(JSON.stringify(value));

test('Only the three public Fellowship studies can travel as topic context', () => {
  assert.deepEqual(plain(topics.FELLOWSHIP_TOPICS.map(topic => topic.id)), ['psalm-22', 'isaiah-53', 'josephus']);
  for (const value of [undefined, null, '', 'Psalm-22', 'psalm-22 ', ['psalm-22'], { id: 'josephus' }, '__proto__', 'private-note']) {
    assert.equal(topics.getFellowshipTopic(value), undefined);
    assert.equal(topics.parseFellowshipTopic(value), undefined);
  }
  for (const topic of topics.FELLOWSHIP_TOPICS) assert.equal(topics.parseFellowshipTopic(topic.id), topic.id);
});

test('A topic link preserves public filters and fragments while replacing duplicate context', () => {
  assert.equal(topics.fellowshipDiscoveryHref('psalm-22'), '/circles?format=online&fellowship=psalm-22');
  assert.equal(topics.withFellowshipTopic('/circles?format=online&fellowship=old&fellowship=other#results', 'isaiah-53'),
    '/circles?format=online&fellowship=isaiah-53#results');
  assert.equal(topics.withFellowshipTopic('/circles?fellowship=psalm-22&format=online'), '/circles?format=online');
  for (const href of ['https://outside.test/', '//outside.test/', 'circles', '/back\\slash', '/new\nline', '/tab\tpath', '/nul\0path', '/del\u007fpath']) {
    assert.throws(() => topics.withFellowshipTopic(href, 'psalm-22'));
  }
  assert.throws(() => topics.withFellowshipTopic('/circles', 'unknown'));
});

test('Every editable draft has actual newlines, public provenance and fits the immersive review', () => {
  for (const topic of topics.FELLOWSHIP_TOPICS) {
    const draft = topics.fellowshipDiscussionDraft(topic.id);
    assert.equal(draft, topic.question + '\n\n' + topic.href);
    assert(!draft.includes('\\n'));
    assert(draft.length <= ROOM_POST_LIMIT, topic.id);
    assert.equal(roomReviewText({ preview: { content: draft } }), draft);
    assert.equal(topics.fellowshipDiscussionDraft(topic.id, 'https://public.test'), topic.question + '\n\nhttps://public.test' + topic.href);
    assert.equal(topics.fellowshipDiscussionDraft(topic.id, 'http://127.0.0.1:4312'), topic.question + '\n\nhttp://127.0.0.1:4312' + topic.href);
  }
  for (const origin of ['http://outside.test', 'https://user:password@public.test', 'https://public.test/private', 'https://public.test?token=value', 'https://public.test#note']) {
    assert.throws(() => topics.fellowshipDiscussionDraft('josephus', origin));
  }
});

const DiscussionBrowser = () => null;
const CircleSafetyNav = () => null;
const load = sourceLoader({ 'next/link': () => null, 'next/navigation': { notFound() { throw Error('not found'); } },
  '@/components/PublicFooter': () => null, '../../messages/CircleSafetyNav': CircleSafetyNav,
  './DiscussionBrowser': DiscussionBrowser, './discussion.module.css': {} });
const page = load('app/circles/[circleId]/discussion/page.tsx').default;
function find(tree, type) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (tree.type === type) return tree;
  return [tree.props?.children].flat(Infinity).map(child => find(child, type)).find(Boolean);
}

test('Actual discussion entry retains a single validated topic through sign-in', async () => {
  const tree = await page({ params: Promise.resolve({ circleId }), searchParams: Promise.resolve({ fellowship: 'josephus' }) });
  const browser = find(tree, DiscussionBrowser);
  assert.equal(browser.props.invalidIntent, false);
  assert.equal(browser.props.fellowship, 'josephus');
  assert.equal(browser.props.reel, undefined);
  assert.equal(browser.props.study, undefined);
  assert.equal(browser.props.messageId, null);
  assert.equal(find(tree, CircleSafetyNav).props.signInHref,
    '/login?next=' + encodeURIComponent('/circles/' + circleId + '/discussion?fellowship=josephus'));
});

test('Unknown, duplicate or mixed discussion starters fail closed at the actual server page', async () => {
  for (const query of [{ fellowship: 'private-note' }, { fellowship: ['josephus', 'josephus'] },
    { fellowship: 'josephus', reel: 'which-height' }, { fellowship: 'psalm-22', study: 'philemon' },
    { fellowship: 'isaiah-53', message: circleId }, { fellowship: 'josephus', token: 'no' }]) {
    const tree = await page({ params: Promise.resolve({ circleId }), searchParams: Promise.resolve(query) });
    const browser = find(tree, DiscussionBrowser);
    assert.equal(browser.props.invalidIntent, true);
    assert.equal(browser.props.fellowship, undefined);
    assert.equal(browser.props.reel, undefined);
    assert.equal(browser.props.study, undefined);
    assert.equal(find(tree, CircleSafetyNav).props.signInHref, undefined);
  }
});

test('Existing Reel and Root Kernel discussion starters retain their own provenance', async () => {
  const reel = find(await page({ params: Promise.resolve({ circleId }), searchParams: Promise.resolve({ reel: 'which-height' }) }), DiscussionBrowser);
  assert.equal(reel.props.invalidIntent, false); assert.equal(reel.props.reel, 'which-height'); assert.equal(reel.props.fellowship, undefined);
  const study = find(await page({ params: Promise.resolve({ circleId }), searchParams: Promise.resolve({ study: 'philemon' }) }), DiscussionBrowser);
  assert.equal(study.props.invalidIntent, false); assert.equal(study.props.study, 'philemon'); assert.equal(study.props.fellowship, undefined);
});
