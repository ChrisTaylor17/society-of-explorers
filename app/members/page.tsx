'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getMemberSession, getSupabaseAccessToken } from '@/lib/auth/getSession'
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DIRECT_MESSAGE_ACK_LIMIT, DIRECT_MESSAGE_OWNER_HEADER, parseDirectMessageThread, type DirectContact,
  type DirectMessage, type DirectMessageBlockChange } from '@/lib/members/direct-message'
import DirectMessageBlocks, { sendBlockChange } from './DirectMessageBlocks'
import styles from './direct-message.module.css'
import PublishedProfileLink from '@/components/PublishedProfileLink'

interface Member {
  id: string
  display_name: string
  discipline?: string
  skills?: string[]
  project_description?: string
  seeking?: string
  bio?: string
  philosophy?: string
}

type MemberSkillValue = string[] | string | null | undefined

type MemberRecord = Omit<Member, 'skills'> & {
  skills?: MemberSkillValue
}

function normalizeSkills(skills: MemberSkillValue): string[] {
  if (Array.isArray(skills)) return skills
  if (typeof skills === 'string') {
    return skills
      .split(',')
      .map(skill => skill.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeMember(member: MemberRecord): Member {
  return {
    id: member.id,
    display_name: member.display_name,
    bio: member.bio,
    discipline: member.discipline,
    project_description: member.project_description,
    seeking: member.seeking,
    philosophy: member.philosophy,
    skills: normalizeSkills(member.skills),
  }
}

function displayName(m: Member): string {
  if (m.display_name && !m.display_name.startsWith('0x')) return m.display_name
  if (m.display_name?.startsWith('0x')) return `${m.display_name.slice(0, 6)}...${m.display_name.slice(-4)}`
  return 'Explorer'
}

function avatarLetter(m: Member): string {
  const name = displayName(m)
  return name.charAt(0).toUpperCase()
}

type ChatScope = {
  peerId: string
  readRevision: number
  sending: boolean
  changingBlock: boolean
}

async function getAuthHeaders(includeContentType = false): Promise<HeadersInit> {
  const accessToken = await getSupabaseAccessToken()
  return {
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

const THINKERS = [
  { id: 'socrates', name: 'Socrates', symbol: 'Σ', question: 'What would count as good evidence for each of our views?' },
  { id: 'nietzsche', name: 'Nietzsche', symbol: 'N', question: 'Which of our assumptions comes from habit?' },
  { id: 'aurelius', name: 'Marcus Aurelius', symbol: 'M', question: 'Which part of this situation can we act on?' },
  { id: 'einstein', name: 'Einstein', symbol: 'E', question: 'What simple example could we use to test the idea?' },
  { id: 'jobs', name: 'Steve Jobs', symbol: 'J', question: 'What could we remove and still solve the problem that matters?' },
  { id: 'plato', name: 'Plato', symbol: 'Π', question: 'What would a fair rule look like from both sides?' },
]

const gold = '#c9a84c'
const goldDim = 'rgba(201,168,76,0.5)'
const goldBorder = 'rgba(201,168,76,0.2)'
const bg = '#000'
const bgCard = '#0a0a0a'
const bgElevated = '#111'
const ivory = '#e8e0d0'
const muted = '#7a7060'

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [contact, setContact] = useState<DirectContact | null>(null)
  const [blockReview, setBlockReview] = useState<DirectContact | null>(null)
  const [blockBusy, setBlockBusy] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [view, setView] = useState<'directory' | 'chat' | 'match' | 'profile' | 'blocked'>('directory')
  const [directoryStatus, setDirectoryStatus] = useState<'loading' | 'ready' | 'forbidden' | 'unavailable'>('loading')
  const [retired, setRetired] = useState(false)
  const [matchQuery, setMatchQuery] = useState('')
  const [matchResult, setMatchResult] = useState('')
  const [matchLoading, setMatchLoading] = useState(false)
  const [showThinkerPicker, setShowThinkerPicker] = useState(false)
  const [sendStatus, setSendStatus] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [recording, setRecording] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const authorityEpoch = useRef(0)
  const chatScope = useRef<ChatScope | null>(null)
  const router = useRouter()
  const currentMemberId = currentMember?.id ?? null
  const selectedMemberId = selectedMember?.id ?? null
  const canCompose = Boolean(contact?.canMessage && !blockBusy && !blockReview)

  const dmHeaders = useCallback(async (json = false) => {
    const scoped = new Headers(await getAuthHeaders(json))
    if (currentMemberId) scoped.set(DIRECT_MESSAGE_OWNER_HEADER, currentMemberId)
    return scoped
  }, [currentMemberId])

  useEffect(() => {
    const invalidate = () => {
      authorityEpoch.current++
      chatScope.current = null
    }
    const stop = subscribeAuthProviderChanges(() => {
      invalidate()
      setRetired(true); setCurrentMember(null); setSelectedMember(null); setMembers([]); setMessages([])
      setInput(''); setContact(null); setBlockReview(null); setBlockBusy(false)
      setSendStatus(''); setMatchQuery(''); setMatchResult(''); setUnreadCount(0)
    })
    return () => { invalidate(); stop() }
  }, [])

  useEffect(() => {
    if (retired) return
    let cancelled = false
    const generation = authorityEpoch.current

    getMemberSession().then(session => {
      if (cancelled || generation !== authorityEpoch.current) return
      if (!session) { router.push('/'); return }
      const sessionMember = session.member as MemberRecord
      setCurrentMember(normalizeMember(sessionMember))
    })

    getAuthHeaders()
      .then(headers => {
        if (cancelled || generation !== authorityEpoch.current) throw new Error('retired')
        return fetch('/api/members/discover', { headers, cache: 'no-store' })
      })
      .then(async res => {
        if (!res.ok) throw new Error(res.status === 403 ? 'membership' : 'unavailable')
        return res.json() as Promise<{ members?: MemberRecord[] }>
      })
      .then(({ members: discoveredMembers }) => {
        if (cancelled || generation !== authorityEpoch.current) return
        if (!Array.isArray(discoveredMembers) || discoveredMembers.some(member => !member || typeof member.id !== 'string' || typeof member.display_name !== 'string')) throw new Error('unavailable')
        setMembers(discoveredMembers.map(normalizeMember)); setDirectoryStatus('ready')
      })
      .catch(error => {
        if (!cancelled && generation === authorityEpoch.current) setDirectoryStatus(error instanceof Error && error.message === 'membership' ? 'forbidden' : 'unavailable')
      })

    return () => { cancelled = true }
  }, [router, retired])

  // Load unread count
  useEffect(() => {
    if (!currentMemberId) return
    let cancelled = false

    dmHeaders().then(headers => {
      if (cancelled) throw new Error('retired')
      return fetch('/api/message', { headers, cache: 'no-store' })
    })
      .then(async res => {
        if (!res.ok) throw new Error(await res.text())
        return res.json() as Promise<{ unreadCount?: number }>
      })
      .then(data => {
        if (!cancelled) setUnreadCount(data.unreadCount ?? 0)
      })
      .catch(error => {
        if (!cancelled) console.error('unread count failed:', error)
      })

    return () => { cancelled = true }
  }, [currentMemberId, dmHeaders, messages])

  const loadMessages = useCallback(async () => {
    const scope = chatScope.current
    if (!scope || scope.peerId !== selectedMemberId || !currentMemberId || scope.changingBlock) return
    const generation = authorityEpoch.current
    const revision = ++scope.readRevision
    const current = () => generation === authorityEpoch.current && chatScope.current === scope &&
      revision === scope.readRevision && document.visibilityState === 'visible'
    if (!current()) return

    try {
      const headers = await dmHeaders()
      if (!current()) return
      const signal = AbortSignal.timeout(8_000)
      const res = await fetch(`/api/message?peerId=${encodeURIComponent(scope.peerId)}`, {
        headers, cache: 'no-store', signal,
      })
      if (!current()) return
      const data = res.ok ? parseDirectMessageThread(await res.json(), currentMemberId, scope.peerId) : null
      if (!current()) return
      if (!data || !data.contact.canMessage) {
        setContact(data?.contact ?? null)
        setMessages([])
        if (data || [401, 403, 404].includes(res.status)) setInput('')
        setShowThinkerPicker(false)
        return
      }

      const ids = data.messages.filter(message => message.read === false &&
        message.sender_id === scope.peerId && message.recipient_id === currentMemberId).map(message => message.id)
      headers.set('Content-Type', 'application/json')
      for (let index = 0; index < ids.length; index += DIRECT_MESSAGE_ACK_LIMIT) {
        if (!current()) return
        const reply = await fetch('/api/message', {
          method: 'PATCH', headers, signal,
          body: JSON.stringify({ peerId: scope.peerId, messageIds: ids.slice(index, index + DIRECT_MESSAGE_ACK_LIMIT) }),
        }).catch(() => null)
        if (reply?.status === 401 || reply?.status === 403) {
          if (current()) { setContact(null); setMessages([]); setInput('') }
          return
        }
        if (!reply?.ok) break
      }
      if (current()) { setContact(data.contact); setMessages(data.messages) }
    } catch {
      if (current()) { setContact(null); setMessages([]) }
    }
  }, [currentMemberId, dmHeaders, selectedMemberId])

  useEffect(() => {
    if (view !== 'chat' || !selectedMemberId || !currentMemberId) return
    const refresh = () => void loadMessages()
    const first = window.setTimeout(refresh, 0)
    const interval = window.setInterval(refresh, 10_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [currentMemberId, selectedMemberId, loadMessages, view])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const msg = input.trim()
    const scope = chatScope.current
    if (!msg || !canCompose || !scope || scope.peerId !== selectedMemberId || !currentMemberId || scope.sending || scope.changingBlock) return
    const generation = authorityEpoch.current
    const current = () => generation === authorityEpoch.current && chatScope.current === scope
    scope.sending = true
    setSending(true)
    setSendStatus('')
    try {
      const headers = await dmHeaders(true)
      if (!current()) return
      const res = await fetch('/api/message', {
        method: 'POST', headers, signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({ recipientId: scope.peerId, content: msg }),
      })
      if (!current()) return
      if (res.status === 403) {
        setMessages([]); setContact(null); setInput('')
        setSendStatus('This conversation is unavailable.')
        await loadMessages()
        return
      }
      if (!res.ok) throw new Error('Message not confirmed')
      setInput(draft => draft.trim() === msg ? '' : draft)
      await loadMessages()
    } catch {
      if (current()) setSendStatus('Delivery could not be confirmed. Check the conversation before sending again.')
    } finally {
      scope.sending = false
      if (current()) {
        setSending(false)
        inputRef.current?.focus()
      }
    }
  }

  async function confirmBlock() {
    const scope = chatScope.current
    const checked = blockReview
    if (!checked || !scope || scope.peerId !== selectedMemberId || !currentMemberId || scope.changingBlock || scope.sending) return
    const generation = authorityEpoch.current
    const current = () => generation === authorityEpoch.current && chatScope.current === scope
    scope.changingBlock = true
    scope.readRevision++
    setBlockBusy(true); setBlockReview(null); setContact(null); setMessages([]); setInput('')
    setShowThinkerPicker(false); setSendStatus('Checking the reviewed block change…')
    try {
      const base = { requestId: crypto.randomUUID(), expectedRevision: checked.revision }
      if (checked.blockedByMe && !checked.blockId) throw Error('Block reference missing')
      const input: DirectMessageBlockChange = checked.blockedByMe && checked.blockId
        ? { ...base, blocked: false, blockId: checked.blockId }
        : { ...base, blocked: true, peerId: scope.peerId }
      const headers = await dmHeaders(true)
      if (!current()) return
      const receipt = await sendBlockChange(input, headers)
      if (!current()) return
      setSendStatus(receipt ? receipt.blockedByMe ? 'Direct messages blocked.' : 'Your block was removed.'
        : 'The change was not confirmed. Check the current conversation before trying again.')
    } catch {
      if (current()) setSendStatus('The change could not be confirmed. Check the current conversation before trying again.')
    } finally {
      scope.changingBlock = false
      if (current()) { setBlockBusy(false); await loadMessages() }
    }
  }

  async function findMatch() {
    if (!matchQuery.trim()) return
    const generation = authorityEpoch.current
    setMatchLoading(true); setMatchResult('')
    const memberProfiles = members.filter(m => m.id !== currentMember?.id)
      .map(m => `${m.display_name} | ${m.discipline || 'Explorer'} | Skills: ${(m.skills || []).join(', ')} | Project: ${m.project_description || 'n/a'} | Seeking: ${m.seeking || 'n/a'}`)
      .join('\n')
    const headers = await getAuthHeaders(true)
    if (generation !== authorityEpoch.current) return
    const res = await fetch('/api/match', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: matchQuery, memberProfiles, seekerName: currentMember?.display_name, walletMemberId: currentMember?.id, seekerProfile: currentMember })
    })
    const data = await res.json()
    if (generation !== authorityEpoch.current) return
    setMatchResult(data.result || 'No matches found.')
    setMatchLoading(false)
  }

  function focusChat(peerId: string | null) {
    if ((chatScope.current?.peerId ?? null) === peerId) return
    chatScope.current = peerId ? { peerId, readRevision: 0, sending: false, changingBlock: false } : null
    setContact(null)
    setBlockReview(null)
    setBlockBusy(false)
    setMessages([])
    setInput('')
    setSending(false)
    setSendStatus('')
    setShowThinkerPicker(false)
  }

  function changeView(next: typeof view) {
    focusChat(next === 'chat' ? selectedMemberId : null)
    setView(next)
  }

  function openChat(member: Member) {
    focusChat(member.id)
    setSelectedMember(member)
    setView('chat')
  }

  function formatTime(ts: string | null) {
    if (ts === null) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (retired) return <main style={{ padding: '32px', color: ivory, background: bg }}><h1>Sign-in changed</h1><p>The previous member view is closed.</p><Link href="/members" style={{ display: 'inline-flex', minHeight: '44px', alignItems: 'center', color: gold }}>Reload the selected account</Link></main>

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: bg, fontFamily: 'Cormorant Garamond, serif', color: ivory, overflow: 'hidden' }}>

      {/* TOPBAR */}
      <div className={styles.topBar} style={{ background: bgCard, borderBottom: `1px solid ${goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.25em', color: gold }}>SOCIETY OF EXPLORERS</div>
        <nav className={styles.topNav} aria-label="Member views">
          {(['directory', 'chat', 'match', 'profile'] as const).map(v => (
            <button key={v} onClick={() => changeView(v)} style={{ background: view === v ? `rgba(201,168,76,0.1)` : 'none', border: `1px solid ${view === v ? gold : goldBorder}`, color: view === v ? gold : muted, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', padding: '4px 14px', cursor: 'pointer', borderRadius: '2px', position: 'relative' }}>
              {v === 'chat' && unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#c05050', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif' }}>{unreadCount}</span>
              )}
              {v.toUpperCase()}
            </button>
          ))}
          <button onClick={() => router.push('/salon')} style={{ background: 'none', border: `1px solid ${goldBorder}`, color: muted, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', padding: '4px 14px', cursor: 'pointer', borderRadius: '2px' }}>← SALON</button>
        </nav>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* DIRECTORY VIEW */}
        {view === 'directory' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: goldDim, marginBottom: '2rem' }}>
                {directoryStatus === 'ready' ? `${members.length} PUBLISHED PROFILES` : 'MEMBER DIRECTORY'}
              </div>
              {directoryStatus !== 'ready' && <p role="status">{directoryStatus === 'loading' ? 'Loading published profiles…' : directoryStatus === 'forbidden' ? 'Join this community to view its member directory.' : 'The member directory is unavailable. Reload to try again.'}</p>}
              {directoryStatus === 'ready' && members.length === 0 && <p>No published profiles are available in this directory yet.</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1px', background: goldBorder }}>
                {members.map(m => (
                  <div key={m.id} style={{ background: bgCard, padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${gold}22`, border: `1px solid ${goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold, flexShrink: 0 }}>
                          {avatarLetter(m)}
                        </div>
                        <div>
                          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.1em', color: gold, marginBottom: '2px' }}>{displayName(m)}</div>
                          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted }}>{m.discipline || 'Published profile'}</div>
                        </div>
                      </div>
                    </div>
                    {m.bio && <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, marginBottom: '0.75rem', fontStyle: 'italic' }}>{m.bio}</p>}
                    {m.project_description && <p style={{ fontSize: '13px', color: ivory, lineHeight: 1.5, marginBottom: '0.75rem' }}>{m.project_description}</p>}
                    {m.skills && m.skills.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '1rem' }}>
                        {m.skills.map((sk, i) => (
                          <span key={i} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, border: `1px solid ${goldBorder}`, padding: '2px 6px' }}>{sk.toUpperCase()}</span>
                        ))}
                      </div>
                    )}
                    <PublishedProfileLink profileId={m.id} />
                    {m.id !== currentMember?.id && (
                      <button onClick={() => openChat(m)} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, background: 'none', border: `1px solid ${goldBorder}`, padding: '6px 14px', cursor: 'pointer', width: '100%' }}>
                        SEND MESSAGE
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'blocked' && currentMemberId && (
          <DirectMessageBlocks headersFor={dmHeaders} onBack={() => changeView('chat')} />
        )}

        {/* CHAT VIEW */}
        {view === 'chat' && (
          <div className={styles.chatLayout} data-open={Boolean(selectedMember)}>
            {/* Sidebar — member list */}
            <div className={styles.chatRail} style={{ background: bgCard, borderRight: `1px solid ${goldBorder}`, flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${goldBorder}` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: goldDim }}>CONVERSATIONS</div>
                {currentMemberId && <button type="button" className={styles.safetyButton}
                  onClick={() => changeView('blocked')}>Blocked members</button>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {members.filter(m => m.id !== currentMember?.id).map(m => (
                  <button type="button" className={styles.peerChoice} aria-pressed={selectedMember?.id === m.id}
                    key={m.id}
                    onClick={() => openChat(m)}
                    style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `2px solid ${selectedMember?.id === m.id ? gold : 'transparent'}`, background: selectedMember?.id === m.id ? 'rgba(201,168,76,0.06)' : 'transparent', borderBottom: `1px solid ${goldBorder}` }}
                  >
                    <span style={{ display: 'block', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: selectedMember?.id === m.id ? gold : ivory }}>{displayName(m)}</span>
                    <span style={{ display: 'block', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>Published profile</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat area */}
            <div className={styles.chatPanel} style={{ flex: 1, flexDirection: 'column', overflow: 'hidden', background: bg }}>
              {!selectedMember ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: goldDim }}>⬡</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted }}>SELECT A MEMBER TO BEGIN</div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <button type="button" className={`${styles.safetyButton} ${styles.backToContacts}`}
                    onClick={() => { focusChat(null); setSelectedMember(null) }}>Back to conversations</button>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${goldBorder}`, display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center', background: bgCard, flexShrink: 0 }}>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold }}>{displayName(selectedMember)}</div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{selectedMember.discipline || 'Published profile'}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {contact && <button type="button" className={styles.safetyButton} disabled={sending || blockBusy}
                        onClick={() => { setShowThinkerPicker(false); setBlockReview(contact) }}>{contact.blockedByMe ? 'Unblock member' : 'Block member'}</button>}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setShowThinkerPicker(v => !v)}
                          disabled={sending || !canCompose}
                          aria-expanded={showThinkerPicker}
                          style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, background: 'rgba(201,168,76,0.08)', border: `1px solid ${goldBorder}`, padding: '6px 14px', cursor: 'pointer' }}
                        >
                          ⬡ CHOOSE A THINKER QUESTION
                        </button>
                        {showThinkerPicker && (
                          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: bgElevated, border: `1px solid ${goldBorder}`, zIndex: 100, minWidth: '180px' }}>
                            <p style={{ padding: '0 10px', fontSize: '13px', color: muted }}>Add a prepared question to your draft.</p>
                            {THINKERS.map(t => (
                              <button
                                key={t.id}
                                aria-label={`Add ${t.name}-inspired question to draft`}
                                onClick={() => {
                                  setInput(draft => draft.trim() ? `${draft.trim()} ${t.question}` : t.question)
                                  setShowThinkerPicker(false)
                                  inputRef.current?.focus()
                                }}
                                style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: ivory, background: 'none', border: 'none', borderBottom: `1px solid ${goldBorder}`, cursor: 'pointer' }}
                              >
                                {t.symbol} {t.name.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {blockReview && <section className={styles.review} aria-label="Review direct-message block">
                    <p>{blockReview.blockedByMe ? `Remove your block for ${displayName(selectedMember)}?`
                      : `Block ${displayName(selectedMember)}? This hides the direct conversation and their Circle posts and stops direct replies between you.`}</p>
                    <button type="button" className={styles.safetyButton} onClick={() => void confirmBlock()}>
                      {blockReview.blockedByMe ? 'Confirm unblock' : 'Confirm block'}
                    </button>
                    <button type="button" className={styles.safetyButton} onClick={() => setBlockReview(null)}>Cancel</button>
                  </section>}

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {messages.length === 0 && (
                      <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: goldDim, marginBottom: '1rem' }}>⬡</div>
                        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: muted, fontStyle: 'italic' }}>
                          {contact?.blockedByMe ? 'You blocked direct messages with this member.'
                            : contact?.canMessage === false ? 'This conversation is unavailable.'
                              : contact?.canMessage ? 'Begin the conversation. You can add a Thinker-inspired question to your draft.'
                                : 'Current conversation access is being checked.'}
                        </div>
                      </div>
                    )}
                    {messages.map(msg => {
                      const isMe = msg.sender_id === currentMember?.id
                      const isThinker = msg.content.match(/^[ΣNMEΠJ] [A-Z ]+SPEAKS:/)
                      return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isThinker ? 'center' : isMe ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                          {isThinker ? (
                            <div style={{ background: 'rgba(201,168,76,0.06)', border: `1px solid ${goldBorder}`, borderRadius: '4px', padding: '1rem 1.5rem', maxWidth: '700px', width: '100%' }}>
                              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '0.5rem', opacity: 0.7 }}>
                                {msg.content.split(':')[0]}
                              </div>
                              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, lineHeight: 1.8, fontStyle: 'italic' }}>
                                {msg.content.split(':').slice(1).join(':').trim()}
                              </div>
                            </div>
                          ) : (
                            <div style={{ maxWidth: '65%' }}>
                              {!isMe && <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, marginBottom: '4px' }}>{displayName(selectedMember)}</div>}
                              <div style={{ background: isMe ? 'rgba(201,168,76,0.1)' : bgCard, border: `1px solid ${isMe ? goldBorder : 'rgba(255,255,255,0.06)'}`, borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px' }}>
                                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, lineHeight: 1.6 }}>{msg.content}</div>
                              </div>
                              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, marginTop: '3px', textAlign: isMe ? 'right' : 'left', opacity: 0.5 }}>{formatTime(msg.created_at)}</div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div ref={endRef} />
                  </div>

                  {/* Input */}
                  {sendStatus && <p role="status" style={{ margin: '8px 20px', color: ivory }}>{sendStatus}</p>}
                  {canCompose && <div style={{ padding: '14px 20px', borderTop: `1px solid ${goldBorder}`, background: bgCard, display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                      placeholder={`Message ${displayName(selectedMember)}...`}
                      style={{ flex: 1, minWidth: 0, background: bgElevated, border: `1px solid ${goldBorder}`, padding: '10px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, outline: 'none', borderRadius: '4px' }}
                    />
                    <button
                      onClick={() => setRecording(r => !r)}
                      title="Voice mode — coming soon"
                      style={{ background: recording ? 'rgba(201,168,76,0.15)' : 'none', border: `1px solid ${recording ? gold : goldBorder}`, color: recording ? gold : muted, padding: '10px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '14px' }}
                    >
                      🎙
                    </button>
                    <button
                      onClick={() => sendMessage()}
                      disabled={sending || !input.trim()}
                      style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#000', background: sending ? `${gold}88` : gold, border: 'none', padding: '10px 18px', cursor: 'pointer', borderRadius: '4px', opacity: !input.trim() ? 0.4 : 1 }}
                    >
                      SEND
                    </button>
                  </div>}
                </>
              )}
            </div>
          </div>
        )}

        {/* MATCH VIEW */}
        {view === 'match' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 2rem' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: goldDim, marginBottom: '1rem' }}>AI MATCHMAKER</div>
              <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', color: gold, marginBottom: '2rem' }}>FIND YOUR COLLABORATOR</h2>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem', fontStyle: 'italic' }}>
                Describe what you&apos;re building or looking for. The AI uses the published profiles available in this directory to suggest a collaborator.
              </p>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
                <input
                  value={matchQuery}
                  onChange={e => setMatchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && findMatch()}
                  placeholder="e.g. Looking for a blockchain developer who cares about philosophy..."
                  style={{ flex: 1, background: bgCard, border: `1px solid ${goldBorder}`, padding: '12px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, outline: 'none' }}
                />
                <button
                  onClick={findMatch}
                  disabled={matchLoading}
                  style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: '#000', background: gold, border: 'none', padding: '12px 20px', cursor: 'pointer', opacity: matchLoading ? 0.6 : 1 }}
                >
                  {matchLoading ? 'SCANNING...' : 'FIND MATCH'}
                </button>
              </div>
              {matchResult && (
                <div style={{ background: bgCard, border: `1px solid ${goldBorder}`, padding: '2rem', borderLeft: `2px solid ${gold}` }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem', opacity: 0.7 }}>YOUR MATCH</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: ivory, lineHeight: 1.9 }}>{matchResult}</div>
                </div>
              )}
            </div>
          </div>
        )}
      {/* PROFILE VIEW */}
        {view === 'profile' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 2rem' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: goldDim, marginBottom: '1rem' }}>YOUR IDENTITY</div>
              <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', color: gold, marginBottom: '0.5rem' }}>EDIT YOUR PROFILE</h2>
              <p style={{ color: ivory, lineHeight: 1.7 }}>Choose which profile fields you publish. Your profile starts private.</p>
              <Link href="/account/profile" style={{ display: 'inline-flex', minHeight: '44px', alignItems: 'center', color: gold, padding: '8px 14px', border: `1px solid ${goldBorder}` }}>Open profile settings</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
