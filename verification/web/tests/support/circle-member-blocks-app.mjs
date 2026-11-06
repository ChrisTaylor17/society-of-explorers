import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPublicProfileApp } from './public-profile-app.mjs';
import { rpc } from './review-coverage-db.mjs';
import { asRole } from './circle-live-db.mjs';

export const text = {
  target: 'Synthetic post by the member to block.',
  targetOther: 'A separate synthetic post by the same member.',
  viewer: 'Synthetic viewer contribution.',
  independent: 'Synthetic independent reply under the blocked parent.',
};

export async function createCircleMemberBlocksApp() {
  const app = await createPublicProfileApp({ memberBlocks: true });
  try {
    const circleId = await app.seedCircle({ title: 'Synthetic Circle member safety', reading: false });
    await app.join(circleId);
    await app.join(circleId, 'outsider');
    await app.updateProfile({ visibility: 'public' }, 'other');
    const { author: viewerId, other: targetId, outsider: thirdId } = app.actors;
    async function post(actor, content, parentId = null) {
      const anchor = parentId ? (await rpc(app.db, 'soe_circle_discussion_target', [actor, circleId, parentId])).target : null;
      return (await rpc(app.db, 'soe_circle_discussion_post', [actor, circleId, randomUUID(), content, parentId,
        anchor?.revision ?? null, anchor?.contentHash ?? null, 'Synthetic member'])).message.id;
    }
    const postId = await post(targetId, text.target);
    const otherPostId = await post(targetId, text.targetOther);
    const viewerPostId = await post(viewerId, text.viewer);
    const thirdReplyId = await post(thirdId, text.independent, postId);
    const archive = '/api/circles/' + circleId + '/discussion';
    const statePath = '/api/circles/' + circleId + '/messages/' + postId;
    const ownedBlock = async () => {
      const response = await asRole(app.db, 'service_role', tx => tx.query(
        'SELECT public.soe_direct_message_blocks($1,NULL) AS result', [viewerId]));
      return response.rows[0].result.items[0] ?? null;
    };
    return { ...app, circleId, viewerId, targetId, thirdId, postId, otherPostId, viewerPostId, thirdReplyId,
      archive, statePath, ownedBlock, unblock: async () => {
        const block = await ownedBlock();
        assert(block);
        const response = await asRole(app.db, 'service_role', tx => tx.query(
          'SELECT public.soe_direct_message_set_block($1,NULL,$2,false,$3,$4) AS result',
          [viewerId, block.blockId, block.revision, randomUUID()]));
        return response.rows[0].result;
      } };
  } catch (error) {
    await app.close();
    throw error;
  }
}
