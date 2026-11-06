import { isUuid } from '@/lib/ids/uuid'

export const DIRECT_MESSAGE_OWNER_HEADER = 'x-soe-expected-member'
export const MEMBER_BLOCKS_PATH = '/api/members/blocks'
export const DIRECT_MESSAGE_ACK_LIMIT = 100
export const DIRECT_MESSAGE_BLOCK_PAGE_LIMIT = 25

export type DirectMessage = {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  created_at: string | null
  read: boolean | null
}

export type DirectContact = {
  blockId: string | null
  blockedByMe: boolean
  revision: number
  canMessage: boolean
}

export type DirectMessageThread = { messages: DirectMessage[]; contact: DirectContact }
export type DirectMessageBlock = { blockId: string; revision: number; label: string; changedAt: string }
export type DirectMessageBlockPage = { items: DirectMessageBlock[]; nextCursor: string | null }
export type DirectMessageBlockChange = { requestId: string; expectedRevision: number } &
  ({ blocked: true; peerId: string } | { blocked: false; blockId: string })

export type MemberUnblockInput = { expectedMemberId: string; blockId: string; expectedRevision: number; requestId: string }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function parseDirectMessageThread(value: unknown, actor: string, peer: string): DirectMessageThread | null {
  if (!record(value) || !Array.isArray(value.messages) || !record(value.contact)) return null
  const { blockId, blockedByMe, revision: version, canMessage } = value.contact
  if (!(blockId === null || isUuid(blockId)) || !revision(version) || (version === 0) !== (blockId === null)
      || typeof blockedByMe !== 'boolean' || typeof canMessage !== 'boolean' || blockedByMe && (blockId === null || canMessage)
      || !canMessage && value.messages.length !== 0) return null

  const messages: DirectMessage[] = []
  for (const row of value.messages) {
    if (!record(row) || !isUuid(row.id) || typeof row.content !== 'string'
        || row.created_at !== null && typeof row.created_at !== 'string'
        || row.read !== null && typeof row.read !== 'boolean'
        || !((row.sender_id === actor && row.recipient_id === peer) || (row.sender_id === peer && row.recipient_id === actor))) return null
    messages.push({ id: row.id, sender_id: row.sender_id, recipient_id: row.recipient_id,
      content: row.content, created_at: row.created_at, read: row.read })
  }
  return { messages, contact: { blockId, blockedByMe, revision: version, canMessage } }
}

export function parseDirectMessageBlockPage(value: unknown): DirectMessageBlockPage | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > DIRECT_MESSAGE_BLOCK_PAGE_LIMIT
      || !(value.nextCursor === null || isUuid(value.nextCursor))) return null
  const items: DirectMessageBlock[] = []
  for (const item of value.items) {
    if (!record(item) || !isUuid(item.blockId) || !revision(item.revision) || item.revision === 0
        || typeof item.label !== 'string' || !item.label.trim() || Array.from(item.label).length > 200
        || typeof item.changedAt !== 'string' || !Number.isFinite(Date.parse(item.changedAt))) return null
    items.push({ blockId: item.blockId, revision: item.revision, label: item.label, changedAt: item.changedAt })
  }
  if (value.nextCursor !== null && (items.length !== DIRECT_MESSAGE_BLOCK_PAGE_LIMIT || items.at(-1)?.blockId !== value.nextCursor)) return null
  return { items, nextCursor: value.nextCursor }
}

export function parseDirectMessageBlockChange(value: unknown): DirectMessageBlockChange | null {
  if (!record(value) || Object.keys(value).length !== 4 || !isUuid(value.requestId)
      || !revision(value.expectedRevision) || value.expectedRevision === Number.MAX_SAFE_INTEGER) return null
  const base = { requestId: value.requestId.toLowerCase(), expectedRevision: value.expectedRevision }
  if (value.blocked === true && isUuid(value.peerId)) return { ...base, blocked: true, peerId: value.peerId.toLowerCase() }
  if (value.blocked === false && isUuid(value.blockId)) return { ...base, blocked: false, blockId: value.blockId.toLowerCase() }
  return null
}

export function parseDirectMessageBlockReceipt(value: unknown, input: DirectMessageBlockChange) {
  if (!record(value) || value.requestId !== input.requestId || value.blockedByMe !== input.blocked
      || value.revision !== input.expectedRevision + 1 || !isUuid(value.blockId)
      || !input.blocked && value.blockId !== input.blockId) return null
  return { requestId: input.requestId, blockId: value.blockId, blockedByMe: input.blocked, revision: input.expectedRevision + 1 }
}

export function parseMemberUnblockInput(value: unknown): MemberUnblockInput | null {
  if (!record(value) || Object.keys(value).length !== 4 || !isUuid(value.expectedMemberId)
    || !isUuid(value.blockId) || !revision(value.expectedRevision) || value.expectedRevision === 0
    || value.expectedRevision === Number.MAX_SAFE_INTEGER || !isUuid(value.requestId)) return null
  return { expectedMemberId: value.expectedMemberId.toLowerCase(), blockId: value.blockId.toLowerCase(),
    expectedRevision: value.expectedRevision, requestId: value.requestId.toLowerCase() }
}

export function parseMemberBlockPage(value: unknown, expectedMemberId: string): DirectMessageBlockPage | null {
  return record(value) && value.memberId === expectedMemberId ? parseDirectMessageBlockPage(value) : null
}
