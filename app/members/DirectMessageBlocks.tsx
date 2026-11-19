'use client'

import { useEffect, useRef, useState } from 'react'
import { parseDirectMessageBlockPage, parseDirectMessageBlockReceipt, type DirectMessageBlock,
  type DirectMessageBlockChange, type DirectMessageBlockPage } from '@/lib/members/direct-message'
import styles from './direct-message.module.css'

export async function sendBlockChange(input: DirectMessageBlockChange, headers: Headers) {
  const response = await fetch('/api/message', { method: 'PUT', headers, body: JSON.stringify(input),
    signal: AbortSignal.timeout(8_000), cache: 'no-store', redirect: 'error' })
  return response.ok ? parseDirectMessageBlockReceipt(await response.json(), input) : null
}

type Props = {
  headersFor: (json?: boolean) => Promise<Headers>
  onBack: () => void
}

export default function DirectMessageBlocks({ headersFor, onBack }: Props) {
  const lifetime = useRef(0)
  const busy = useRef(false)
  const [page, setPage] = useState<DirectMessageBlockPage | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [review, setReview] = useState<DirectMessageBlock | null>(null)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('Load your private list to manage direct-message blocks.')

  useEffect(() => () => { lifetime.current++ }, [])

  async function load(after: string | null, current: () => boolean) {
    const headers = await headersFor()
    if (!current()) return false
    const query = new URLSearchParams({ blocked: '1' })
    if (after) query.set('after', after)
    const response = await fetch('/api/message?' + query, { headers, cache: 'no-store',
      signal: AbortSignal.timeout(8_000), redirect: 'error' })
    if (!response.ok) return false
    const result = parseDirectMessageBlockPage(await response.json())
    if (!current() || !result) return false
    setPage(result)
    setCursor(after)
    return true
  }

  async function run(after: string | null, unblock?: DirectMessageBlock) {
    if (busy.current) return
    busy.current = true
    const action = ++lifetime.current
    const current = () => lifetime.current === action
    setWorking(true)
    setPage(null)
    setReview(null)
    let confirmed = false
    try {
      if (unblock) {
        const headers = await headersFor(true)
        if (!current()) return
        confirmed = Boolean(await sendBlockChange({
          blocked: false, blockId: unblock.blockId, expectedRevision: unblock.revision, requestId: crypto.randomUUID(),
        }, headers))
      }
      if (!current()) return
      if (!await load(after, current)) throw Error('List unavailable')
      if (current()) setNotice(unblock
        ? confirmed ? 'Your block was removed.' : 'The change was not confirmed. Review the current list.'
        : 'Current blocked members loaded.')
    } catch {
      if (current()) setNotice(confirmed ? 'Your block was removed. Reload the list.' : 'Current blocked members could not be confirmed. Load the list again.')
    } finally {
      busy.current = false
      if (current()) setWorking(false)
    }
  }

  return (
    <section className={styles.blockList} aria-labelledby="blocked-members-heading" aria-busy={working}>
      <button className={styles.safetyButton} type="button" onClick={onBack}>Back to conversations</button>
      <h1 id="blocked-members-heading">Blocked members</h1>
      <p>Blocks apply to direct messages and Circle discussions. Only you can remove a block you set.</p>
      <p role="status">{notice}</p>
      <button className={styles.safetyButton} type="button" disabled={working} onClick={() => void run(null)}>Load blocked members</button>
      {page?.items.length === 0 && <p>{cursor ? 'No more blocked members on this page.' : 'You have no blocked members.'}</p>}
      {!!page?.items.length && (
        <ul>
          {page.items.map(item => (
            <li key={item.blockId}>
              <span>{item.label} · {new Date(item.changedAt).toLocaleString()}</span>
              <button className={styles.safetyButton} type="button" disabled={working} onClick={() => setReview(item)}>Review unblock</button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor && <button className={styles.safetyButton} type="button" disabled={working}
        onClick={() => void run(page.nextCursor)}>Next blocked members</button>}
      {review && <section aria-label="Review unblock">
        <p>Remove your direct-message block for {review.label}?</p>
        <button className={styles.safetyButton} type="button" onClick={() => void run(cursor, review)}>Confirm unblock</button>
        <button className={styles.safetyButton} type="button" onClick={() => setReview(null)}>Cancel</button>
      </section>}
    </section>
  )
}
