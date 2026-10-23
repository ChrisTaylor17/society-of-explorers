'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMemberSession, getSupabaseAccessToken } from '@/lib/auth/getSession'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  display_name: string
  discipline?: string
  skills?: string[]
  project_description?: string
  seeking?: string
  bio?: string
  exp_tokens: number
  wallet_address?: string
  tier?: string
  philosophy?: string
  email?: string
}

type MemberSkillValue = string[] | string | null | undefined

type MemberRecord = Omit<Member, 'skills' | 'exp_tokens'> & {
  skills?: MemberSkillValue
  exp_tokens?: number | null
}

type ProfileDraft = {
  bio: string
  discipline: string
  skills: string
  project_description: string
  seeking: string
  philosophy: string
}

type ProfileDraftKey = keyof ProfileDraft

const PROFILE_FIELDS: { key: ProfileDraftKey; label: string; placeholder: string }[] = [
  { key: 'discipline', label: 'YOUR FIELD', placeholder: 'e.g. Blockchain architect, philosopher, builder, artist...' },
  { key: 'bio', label: 'WHO YOU ARE', placeholder: 'A few sentences about yourself — what drives you, what you believe, where you came from...' },
  { key: 'project_description', label: 'WHAT YOU ARE BUILDING', placeholder: 'Describe your current project or mission...' },
  { key: 'seeking', label: 'WHAT YOU SEEK', placeholder: 'What kind of collaborator, conversation, or connection are you looking for?' },
  { key: 'philosophy', label: 'YOUR PHILOSOPHY', placeholder: 'What do you believe about existence, technology, beauty, truth? What books changed you? What questions haunt you?' },
  { key: 'skills', label: 'YOUR SKILLS', placeholder: 'Comma-separated: e.g. Solidity, product design, Heidegger, go-to-market, writing...' },
]

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

function skillsDraft(skills: MemberSkillValue): string {
  if (Array.isArray(skills)) return skills.join(', ')
  return skills || ''
}

function normalizeMember(member: MemberRecord): Member {
  return {
    ...member,
    skills: normalizeSkills(member.skills),
    exp_tokens: member.exp_tokens ?? 0,
  }
}

function displayName(m: Member): string {
  if (m.display_name && !m.display_name.startsWith('0x')) return m.display_name
  if (m.email) return m.email.split('@')[0]
  if (m.wallet_address) return `${m.wallet_address.slice(0, 6)}...${m.wallet_address.slice(-4)}`
  if (m.display_name?.startsWith('0x')) return `${m.display_name.slice(0, 6)}...${m.display_name.slice(-4)}`
  return 'Explorer'
}

function tierLabel(tier?: string): string {
  const labels: Record<string, string> = { free: 'Explorer', member: 'Member', patron: 'Patron', founding: 'Founding Member' }
  return labels[tier || 'free'] || 'Explorer'
}

function avatarLetter(m: Member): string {
  const name = displayName(m)
  return name.charAt(0).toUpperCase()
}

interface DM {
  id: string
  created_at: string
  sender_id: string
  recipient_id: string
  content: string
  read: boolean
  sender?: Member
  is_thinker?: boolean
  thinker_id?: string
}

type DirectMessageRecord = Omit<DM, 'sender'> & {
  sender?: MemberRecord | null
}

function normalizeDirectMessage(message: DirectMessageRecord): DM {
  return {
    ...message,
    sender: message.sender ? normalizeMember(message.sender) : undefined,
  }
}

async function getAuthHeaders(includeContentType = false): Promise<HeadersInit> {
  const accessToken = await getSupabaseAccessToken()
  return {
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

const THINKERS = [
  { id: 'socrates',  name: 'Socrates',        symbol: 'Σ' },
  { id: 'nietzsche', name: 'Nietzsche',        symbol: 'N' },
  { id: 'aurelius',  name: 'Marcus Aurelius',  symbol: 'M' },
  { id: 'einstein',  name: 'Einstein',         symbol: 'E' },
  { id: 'jobs',      name: 'Steve Jobs',       symbol: 'J' },
  { id: 'plato',     name: 'Plato',            symbol: 'Π' },
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
  const [messages, setMessages] = useState<DM[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [view, setView] = useState<'directory' | 'chat' | 'match' | 'profile'>('directory')
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ bio: '', discipline: '', skills: '', project_description: '', seeking: '', philosophy: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [matchQuery, setMatchQuery] = useState('')
  const [matchResult, setMatchResult] = useState('')
  const [matchLoading, setMatchLoading] = useState(false)
  const [showThinkerPicker, setShowThinkerPicker] = useState(false)
  const [thinkerLoading, setThinkerLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [recording, setRecording] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const currentMemberId = currentMember?.id ?? null
  const selectedMemberId = selectedMember?.id ?? null

  useEffect(() => {
    let cancelled = false

    getMemberSession().then(session => {
      if (cancelled) return
      if (!session) { router.push('/'); return }
      const sessionMember = session.member as MemberRecord
      setCurrentMember(normalizeMember(sessionMember))
      setProfileDraft({
        bio: sessionMember.bio || '',
        discipline: sessionMember.discipline || '',
        skills: skillsDraft(sessionMember.skills),
        project_description: sessionMember.project_description || '',
        seeking: sessionMember.seeking || '',
        philosophy: sessionMember.philosophy || '',
      })
    })

    getAuthHeaders()
      .then(headers => fetch('/api/members/discover', { headers, cache: 'no-store' }))
      .then(async res => {
        if (!res.ok) throw new Error(await res.text())
        return res.json() as Promise<{ members?: MemberRecord[] }>
      })
      .then(({ members: discoveredMembers }) => {
        if (!cancelled) setMembers((discoveredMembers ?? []).map(normalizeMember))
      })
      .catch(error => {
        if (!cancelled) console.error('member discovery failed:', error)
      })

    return () => { cancelled = true }
  }, [router])

  // Load unread count
  useEffect(() => {
    if (!currentMemberId) return
    let cancelled = false

    getAuthHeaders()
      .then(headers => fetch('/api/message', { headers, cache: 'no-store' }))
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
  }, [currentMemberId, messages])

  const loadMessages = useCallback(async () => {
    if (!selectedMemberId || !currentMemberId) return
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/message?peerId=${encodeURIComponent(selectedMemberId)}`, {
      headers,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('loadMessages failed:', await res.text())
      return
    }
    const data = await res.json() as { messages?: DirectMessageRecord[] }
    setMessages((data.messages ?? []).map(normalizeDirectMessage))
  }, [currentMemberId, selectedMemberId])

  useEffect(() => {
    if (!selectedMemberId || !currentMemberId) return
    const initialLoadId = window.setTimeout(() => void loadMessages(), 0)
    const ch = supabase.channel(`dm-${currentMemberId}-${selectedMemberId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => void loadMessages())
      .subscribe()
    return () => {
      window.clearTimeout(initialLoadId)
      supabase.removeChannel(ch)
    }
  }, [currentMemberId, selectedMemberId, loadMessages, supabase])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || !selectedMember || !currentMember || sending) return
    setInput(''); setSending(true)
    const res = await fetch('/api/message', {
      method: 'POST',
      headers: await getAuthHeaders(true),
      body: JSON.stringify({ recipientId: selectedMember.id, content: msg })
    })
    if (!res.ok) console.error('sendMessage failed:', await res.text())
    setSending(false)
    await loadMessages()
    inputRef.current?.focus()
  }

  async function inviteThinker(thinkerId: string) {
    setShowThinkerPicker(false)
    setThinkerLoading(true)
    const thinker = THINKERS.find(t => t.id === thinkerId)
    if (!thinker || !selectedMember || !currentMember) return

    const recentMessages = messages.slice(-6).map(m => {
      const name = m.sender_id === currentMember.id ? currentMember.display_name : selectedMember.display_name
      return `${name}: ${m.content}`
    }).join('\n')

    const res = await fetch('/api/thinker', {
      method: 'POST',
      headers: await getAuthHeaders(true),
      body: JSON.stringify({
        thinkerId,
        message: `You have been invited into a private conversation between ${currentMember.display_name} and ${selectedMember.display_name}. Here are the recent messages:\n\n${recentMessages}\n\nRespond as ${thinker.name} — in character, direct, under 100 words. Address both people.`,
        history: [],
      }),
    })

    let fullResponse = ''
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const evt = JSON.parse(payload)
          if (evt.delta) fullResponse += evt.delta
          if (evt.text) fullResponse += evt.text
        } catch {}
      }
    }

    if (fullResponse) {
      await fetch('/api/message', {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          recipientId: selectedMember.id,
          content: `${thinker.symbol} ${thinker.name.toUpperCase()} SPEAKS: ${fullResponse.replace(/^\[?\w[\w-]*\]?:\s*/i, '')}`
        })
      })
      await loadMessages()
    }
    setThinkerLoading(false)
  }

  async function findMatch() {
    if (!matchQuery.trim()) return
    setMatchLoading(true); setMatchResult('')
    const memberProfiles = members.filter(m => m.id !== currentMember?.id)
      .map(m => `${m.display_name} | ${m.discipline || 'Explorer'} | Skills: ${(m.skills || []).join(', ')} | Project: ${m.project_description || 'n/a'} | Seeking: ${m.seeking || 'n/a'}`)
      .join('\n')
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: matchQuery, memberProfiles, seekerName: currentMember?.display_name, walletMemberId: currentMember?.id, seekerProfile: currentMember })
    })
    const data = await res.json()
    setMatchResult(data.result || 'No matches found.')
    setMatchLoading(false)
  }

  async function saveProfile() {
    if (!currentMember) return
    setProfileSaving(true)
    const res = await fetch('/api/members/profile', {
      method: 'POST',
      headers: await getAuthHeaders(true),
      body: JSON.stringify({
        bio: profileDraft.bio || null,
        discipline: profileDraft.discipline || null,
        skills: profileDraft.skills,
        project_description: profileDraft.project_description || null,
        seeking: profileDraft.seeking || null,
        philosophy: profileDraft.philosophy || null,
      }),
    })
    if (res.ok) {
      const data = await res.json() as { member?: MemberRecord }
      const updatedMember = data.member ? normalizeMember(data.member) : currentMember
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
      setCurrentMember(updatedMember)
      setMembers(previousMembers =>
        previousMembers.map(member => member.id === updatedMember.id ? { ...member, ...updatedMember } : member)
      )
    }
    setProfileSaving(false)
  }

  function openChat(member: Member) {
    setSelectedMember(member)
    setView('chat')
    setMessages([])
  }

  function formatTime(ts: string) {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: bg, fontFamily: 'Cormorant Garamond, serif', color: ivory, overflow: 'hidden' }}>

      {/* TOPBAR */}
      <div style={{ height: '52px', background: bgCard, borderBottom: `1px solid ${goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.25em', color: gold }}>SOCIETY OF EXPLORERS</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {(['directory', 'chat', 'match', 'profile'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? `rgba(201,168,76,0.1)` : 'none', border: `1px solid ${view === v ? gold : goldBorder}`, color: view === v ? gold : muted, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', padding: '4px 14px', cursor: 'pointer', borderRadius: '2px', position: 'relative' }}>
              {v === 'chat' && unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#c05050', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif' }}>{unreadCount}</span>
              )}
              {v.toUpperCase()}
            </button>
          ))}
          <button onClick={() => router.push('/salon')} style={{ background: 'none', border: `1px solid ${goldBorder}`, color: muted, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', padding: '4px 14px', cursor: 'pointer', borderRadius: '2px' }}>← SALON</button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* DIRECTORY VIEW */}
        {view === 'directory' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: goldDim, marginBottom: '2rem' }}>
                {members.length} MEMBERS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: goldBorder }}>
                {members.map(m => (
                  <div key={m.id} style={{ background: bgCard, padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${gold}22`, border: `1px solid ${goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold, flexShrink: 0 }}>
                          {avatarLetter(m)}
                        </div>
                        <div>
                          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.1em', color: gold, marginBottom: '2px' }}>{displayName(m)}</div>
                          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted }}>{tierLabel(m.tier)} {m.discipline ? `· ${m.discipline}` : ''}</div>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: goldDim }}>{m.exp_tokens} ⬡</div>
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

        {/* CHAT VIEW */}
        {view === 'chat' && (
          <>
            {/* Sidebar — member list */}
            <div style={{ width: '260px', background: bgCard, borderRight: `1px solid ${goldBorder}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${goldBorder}` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: goldDim }}>CONVERSATIONS</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {members.filter(m => m.id !== currentMember?.id).map(m => (
                  <div
                    key={m.id}
                    onClick={() => openChat(m)}
                    style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `2px solid ${selectedMember?.id === m.id ? gold : 'transparent'}`, background: selectedMember?.id === m.id ? 'rgba(201,168,76,0.06)' : 'transparent', borderBottom: `1px solid ${goldBorder}` }}
                  >
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: selectedMember?.id === m.id ? gold : ivory }}>{displayName(m)}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{tierLabel(m.tier)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: bg }}>
              {!selectedMember ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: goldDim }}>⬡</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted }}>SELECT A MEMBER TO BEGIN</div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${goldBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bgCard, flexShrink: 0 }}>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold }}>{displayName(selectedMember)}</div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{tierLabel(selectedMember.tier)}{selectedMember.discipline ? ` · ${selectedMember.discipline}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setShowThinkerPicker(v => !v)}
                          disabled={thinkerLoading}
                          style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, background: 'rgba(201,168,76,0.08)', border: `1px solid ${goldBorder}`, padding: '6px 14px', cursor: 'pointer' }}
                        >
                          {thinkerLoading ? 'THINKING...' : '⬡ INVITE A THINKER'}
                        </button>
                        {showThinkerPicker && (
                          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: bgElevated, border: `1px solid ${goldBorder}`, zIndex: 100, minWidth: '180px' }}>
                            {THINKERS.map(t => (
                              <button
                                key={t.id}
                                onClick={() => inviteThinker(t.id)}
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

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {messages.length === 0 && (
                      <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: goldDim, marginBottom: '1rem' }}>⬡</div>
                        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: muted, fontStyle: 'italic' }}>
                          Begin the conversation. Invite a thinker to join if you wish.
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
                  <div style={{ padding: '14px 20px', borderTop: `1px solid ${goldBorder}`, background: bgCard, display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                      placeholder={`Message ${displayName(selectedMember)}...`}
                      style={{ flex: 1, background: bgElevated, border: `1px solid ${goldBorder}`, padding: '10px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, outline: 'none', borderRadius: '4px' }}
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
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* MATCH VIEW */}
        {view === 'match' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 2rem' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: goldDim, marginBottom: '1rem' }}>AI MATCHMAKER</div>
              <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', color: gold, marginBottom: '2rem' }}>FIND YOUR COLLABORATOR</h2>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem', fontStyle: 'italic' }}>
                Describe what you&apos;re building or what you&apos;re looking for. The AI will scan all member profiles and find your most aligned collaborator.
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
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', color: muted, fontStyle: 'italic', lineHeight: 1.7, marginBottom: '2.5rem' }}>
                Your profile is only visible to the Oracle and to other members. The more you reveal, the more profound the connections the Oracle can find.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {PROFILE_FIELDS.map(field => (
                  <div key={field.key}>
                    <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>{field.label}</label>
                    <textarea
                      value={profileDraft[field.key]}
                      onChange={e => setProfileDraft(d => ({ ...d, [field.key]: e.target.value }))}
                      rows={field.key === 'philosophy' ? 4 : 2}
                      placeholder={field.placeholder}
                      style={{ width: '100%', background: bgCard, border: '1px solid ' + goldBorder, padding: '0.9rem 1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
                <button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: profileSaved ? '#4a7a4a' : (profileSaving ? gold + '88' : gold), border: 'none', padding: '1rem 2rem', cursor: profileSaving ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}
                >
                  {profileSaved ? '✓ SAVED' : profileSaving ? 'SAVING...' : 'SAVE PROFILE'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
