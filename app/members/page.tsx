'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMemberSession } from '@/lib/auth/getSession'
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
  const [view, setView] = useState<'directory' | 'chat' | 'match'>('directory')
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
  const supabase = createClient()

  useEffect(() => {
    getMemberSession().then(session => {
      if (!session) { router.push('/'); return }
      setCurrentMember(session.member)
    })
    supabase.from('members').select('*').order('exp_tokens', { ascending: false })
      .then(({ data }) => { if (data) setMembers(data) })
  }, [])

  // Load unread count
  useEffect(() => {
    if (!currentMember) return
    supabase.from('direct_messages')
      .select('id', { count: 'exact' })
      .eq('recipient_id', currentMember.id)
      .eq('read', false)
      .then(({ count }) => setUnreadCount(count ?? 0))
  }, [currentMember, messages])

  useEffect(() => {
    if (!selectedMember || !currentMember) return
    loadMessages()
    const ch = supabase.channel(`dm-${currentMember.id}-${selectedMember.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedMember, currentMember])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    if (!selectedMember || !currentMember) return
    const { data, error } = await supabase.from('direct_messages')
      .select('*, sender:sender_id(id,display_name,wallet_address)')
      .or(`and(sender_id.eq.${currentMember.id},recipient_id.eq.${selectedMember.id}),and(sender_id.eq.${selectedMember.id},recipient_id.eq.${currentMember.id})`)
      .order('created_at', { ascending: true })
    if (error) console.error('loadMessages error:', error)
    if (data) setMessages(data as any)
    await supabase.from('direct_messages').update({ read: true })
      .eq('recipient_id', currentMember.id)
      .eq('sender_id', selectedMember.id)
      .eq('read', false)
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || !selectedMember || !currentMember || sending) return
    setInput(''); setSending(true)
    const res = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: currentMember.id, recipientId: selectedMember.id, content: msg })
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thinkerId,
        message: `You have been invited into a private conversation between ${currentMember.display_name} and ${selectedMember.display_name}. Here are the recent messages:\n\n${recentMessages}\n\nRespond as ${thinker.name} — in character, direct, under 100 words. Address both people.`,
        history: [],
        walletMemberId: currentMember.id,
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentMember.id,
          recipientId: selectedMember.id,
          content: `${thinker.symbol} ${thinker.name.toUpperCase()} SPEAKS: ${fullResponse}`
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
      body: JSON.stringify({ query: matchQuery, memberProfiles, seekerName: currentMember?.display_name })
    })
    const data = await res.json()
    setMatchResult(data.result || 'No matches found.')
    setMatchLoading(false)
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
          {(['directory', 'chat', 'match'] as const).map(v => (
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
                {members.length} EXPLORERS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: goldBorder }}>
                {members.map(m => (
                  <div key={m.id} style={{ background: bgCard, padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.1em', color: gold, marginBottom: '2px' }}>{m.display_name}</div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted }}>{m.discipline || 'EXPLORER'}</div>
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
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: selectedMember?.id === m.id ? gold : ivory }}>{m.display_name}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{m.discipline || 'EXPLORER'}</div>
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
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold }}>{selectedMember.display_name}</div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>{selectedMember.discipline || 'EXPLORER'}</div>
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
                              {!isMe && <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, marginBottom: '4px' }}>{selectedMember.display_name}</div>}
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
                      placeholder={`Message ${selectedMember.display_name}...`}
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
      </div>
    </div>
  )
}
