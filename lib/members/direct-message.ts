export const DIRECT_MESSAGE_OWNER_HEADER = 'x-soe-expected-member'
export const DIRECT_MESSAGE_ACK_LIMIT = 100

export type DirectMessage = {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  created_at: string
  read: boolean
}
