import type { NextRequest } from 'next/server'
import { privateJson } from '@/lib/http/routeError'
import { isUuid } from '@/lib/ids/uuid'
import { parseDirectMessageBlockPage, parseDirectMessageBlockReceipt, parseMemberUnblockInput } from '@/lib/members/direct-message'
import { directMessageReply, messageOwner, messageWrite } from '@/lib/members/direct-message-server'

export async function GET(req: NextRequest) {
  const actor = await messageOwner(req)
  if (!actor) return privateJson({ error: 'Sign in to view blocked members.' }, { status: 401 })
  const query = req.nextUrl.searchParams
  const after = query.get('after')
  if ([...query.keys()].some(key => key !== 'after') || query.getAll('after').length > 1
    || (after !== null && !isUuid(after))) {
    return privateJson({ error: 'Use a valid blocked-members page.' }, { status: 400 })
  }
  return directMessageReply('soe_direct_message_blocks', { p_actor: actor.memberId, p_after: after }, value => {
    const page = parseDirectMessageBlockPage(value)
    return page && { memberId: actor.memberId, ...page }
  })
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.search) return privateJson({ error: 'Use the unblock request without a query.' }, { status: 400 })
  const request = await messageWrite(req)
  if (!request.ok) return request.response
  const input = parseMemberUnblockInput(request.body)
  if (!input) return privateJson({ error: 'Review a valid block before unblocking.' }, { status: 400 })
  if (input.expectedMemberId !== request.memberId) {
    return privateJson({ error: 'Review the block with the same account.' }, { status: 401 })
  }
  return directMessageReply('soe_direct_message_set_block', {
    p_actor: request.memberId, p_peer: null, p_block_id: input.blockId, p_blocked: false,
    p_expected_revision: input.expectedRevision, p_request_id: input.requestId,
  }, value => parseDirectMessageBlockReceipt(value, { ...input, blocked: false }))
}
