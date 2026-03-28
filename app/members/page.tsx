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
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [messages, setMessages] = useState<DM[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [view, setView] = useState<'directory' | 'chat'>('directory')
  const [matchQuery, setMatchQuery] = useState('')
  const [matchResult, setMatchResult] = useState('')
  const [matchLoading, setMatchLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!selectedMember || !currentMember) return
    loadMessages()
    const ch = supabase.channel(`dm-${currentMember.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedMember, currentMember])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadMessages() {
    if (!selectedMember || !currentMember) return
    const { data } = await supabase.from('direct_messages')
      .select('*, sender:sender_id(id,display_name,wallet_address)')
      .or(`and(sender_id.eq.${currentMember.id},recipient_id.eq.${selectedMember.id}),and(sender_id.eq.${selectedMember.id},recipient_id.eq.${currentMember.id})`)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as any)
    // Mark as read
    await supabase.from('direct_messages').update({ read: true })
      .eq('recipient_id', currentMember.id).eq('sender_id', selectedMember.id).eq('read', false)
  }

  async function sendMessage() {
    if (!input.trim() || !selectedMember || !currentMember || sending) return
    const text = input.trim(); setInput(''); setSending(true)
    await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: currentMember.id, recipientId: selectedMember.id, content: text })
    })
    setSending(false)
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
    setSelectedMember(member); setView('chat'); setMessages([])
  }

  const s = {
    page: { height:'100vh', display:'flex', flexDirection:'column' as const, background:'var(--bg-void)' },
    topbar: { height:'52px', background:'linear-gradient(180deg,#0a0900,var(--bg-deep))', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', flexShrink:0 as const },
    brand: { fontFamily:'Cinzel,serif', fontSize:'13px', letterSpacing:'0.25em', color:'var(--gold)' },
    nav: { display:'flex', gap:'8px' },
    navBtn: (active: boolean): React.CSSProperties => ({ background: active ? 'var(--glow)' : 'none', border:'1px solid ' + (active ? 'var(--gold-dim)' : 'var(--border)'), color: active ? 'var(--gold)' : 'var(--ivory-muted)', fontFamily:'Cinzel,serif', fontSize:'10px', letterSpacing:'0.15em', padding:'4px 14px', cursor:'pointer', borderRadius:'2px' }),
    body: { flex:1, display:'grid', gridTemplateColumns: view === 'chat' ? '280px 1fr' : '1fr', overflow:'hidden' },
    sidebar: { background:'var(--bg-panel)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' as const, overflow:'hidden' },
    memberItem: (selected: boolean): React.CSSProperties => ({ padding:'14px 16px', cursor:'pointer', borderLeft:`2px solid ${selected ? 'var(--gold)' : 'transparent'}`, background: selected ? 'linear-gradient(90deg,var(--glow-strong),transparent)' : 'transparent', transition:'all 0.2s' }),
    chat: { display:'flex', flexDirection:'column' as const, overflow:'hidden', background:'var(--bg-deep)' },
    sectionTitle: { fontFamily:'Cinzel,serif', fontSize:'9px', letterSpacing:'0.3em', color:'var(--gold-dim)', textTransform:'uppercase' as const },
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div style={s.brand}>Society of Explorers</div>
        <div style={s.nav}>
          <button style={s.navBtn(view==='directory')} onClick={()=>setView('directory')}>Directory</button>
          {selectedMember && <button style={s.navBtn(view==='chat')} onClick={()=>setView('chat')}>↩ {selectedMember.display_name}</button>}
          <button style={s.navBtn(false)} onClick={()=>router.push('/salon')}>The Salon</button>
          <button style={s.navBtn(false)} onClick={()=>router.push('/book')}>Book Space</button>
        </div>
        <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:'12px',color:'var(--ivory-muted)',fontStyle:'italic'}}>📍 92B South St · {currentMember?.display_name}</div>
      </div>

      {view === 'directory' && (
        <div style={{flex:1,overflowY:'auto',padding:'32px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:'16px',alignContent:'start'}}>
          {/* AI Matchmaker */}
          <div style={{gridColumn:'1/-1',background:'var(--bg-surface)',border:'1px solid var(--border-bright)',borderRadius:'4px',padding:'24px',marginBottom:'8px'}}>
            <div style={{...s.sectionTitle,marginBottom:'14px'}}>◈ AI Matchmaker — Find Your Collaborator</div>
            <div style={{display:'flex',gap:'10px'}}>
              <input value={matchQuery} onChange={e=>setMatchQuery(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&findMatch()}
                placeholder="Describe what you're looking for — skills, project type, goals..."
                style={{flex:1,background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'3px',padding:'10px 14px',color:'var(--ivory)',fontFamily:'EB Garamond,serif',fontSize:'15px',outline:'none'}}/>
              <button onClick={findMatch} disabled={matchLoading} style={{padding:'10px 20px',background:'linear-gradient(135deg,#1c1500,#2a1e00)',border:'1px solid var(--gold-dim)',borderRadius:'3px',color:'var(--gold)',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.15em',cursor:'pointer'}}>
                {matchLoading ? 'Searching...' : 'Match'}
              </button>
            </div>
            {matchResult && (
              <div style={{marginTop:'14px',padding:'14px',background:'var(--bg-elevated)',border:'1px solid var(--border)',borderLeft:'3px solid var(--gold-dim)',borderRadius:'2px 4px 4px 2px',fontFamily:'Cormorant Garamond,serif',fontSize:'15px',color:'var(--ivory)',fontStyle:'italic',lineHeight:1.6}}>
                {matchResult}
              </div>
            )}
          </div>

          {/* Member cards */}
          {members.filter(m=>m.id!==currentMember?.id).map(m => (
            <div key={m.id} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'4px',padding:'20px',transition:'all 0.3s',cursor:'pointer'}}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--border-bright)')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                <div>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:'20px',fontWeight:500,color:'var(--ivory)'}}>{m.display_name}</div>
                  <div style={{fontSize:'11px',color:'var(--gold-dim)',marginTop:'2px',fontStyle:'italic'}}>{m.discipline || 'Explorer'}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:'Cinzel,serif',fontSize:'16px',color:'var(--gold-light)'}}>{m.exp_tokens}</div>
                  <div style={{fontSize:'9px',color:'var(--text-muted)',letterSpacing:'0.1em'}}>EXP</div>
                </div>
              </div>
              {m.project_description && <div style={{fontSize:'13px',color:'var(--text-secondary)',lineHeight:1.5,marginBottom:'10px',fontStyle:'italic'}}>"{m.project_description}"</div>}
              {m.seeking && <div style={{fontSize:'12px',color:'var(--ivory-muted)',marginBottom:'14px'}}>↝ Seeking: {m.seeking}</div>}
              {m.skills && m.skills.length > 0 && (
                <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'14px'}}>
                  {m.skills.map((sk,i) => <span key={i} style={{fontSize:'10px',padding:'3px 8px',background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'2px',color:'var(--ivory-muted)',letterSpacing:'0.06em'}}>{sk}</span>)}
                </div>
              )}
              {m.wallet_address && <div style={{fontSize:'10px',color:'var(--gold-dim)',fontFamily:'monospace',marginBottom:'12px'}}>⬡ {m.wallet_address}</div>}
              <button onClick={()=>openChat(m)} style={{width:'100%',padding:'9px',background:'transparent',border:'1px solid var(--border-bright)',borderRadius:'3px',color:'var(--gold)',fontFamily:'Cinzel,serif',fontSize:'10px',letterSpacing:'0.15em',cursor:'pointer',transition:'all 0.2s'}}
                onMouseEnter={e=>{(e.target as any).style.background='var(--glow)';}}
                onMouseLeave={e=>{(e.target as any).style.background='transparent';}}>
                SEND MESSAGE
              </button>
            </div>
          ))}
          {members.filter(m=>m.id!==currentMember?.id).length === 0 && (
            <div style={{gridColumn:'1/-1',textAlign:'center',padding:'64px',fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:'18px',color:'var(--text-muted)'}}>
              The salon awaits its first members.<br/>Share the link to invite explorers.
            </div>
          )}
        </div>
      )}

      {view === 'chat' && selectedMember && (
        <div style={s.body}>
          {/* Member list sidebar */}
          <div style={s.sidebar}>
            <div style={{padding:'16px',borderBottom:'1px solid var(--border)'}}>
              <div style={s.sectionTitle}>Messages</div>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              {members.filter(m=>m.id!==currentMember?.id).map(m => (
                <div key={m.id} onClick={()=>{setSelectedMember(m);setMessages([])}} style={s.memberItem(selectedMember.id===m.id)}>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:'15px',color:selectedMember.id===m.id?'var(--gold-light)':'var(--ivory)'}}>{m.display_name}</div>
                  <div style={{fontSize:'10px',color:'var(--ivory-muted)',marginTop:'2px'}}>{m.discipline||'Explorer'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat window */}
          <div style={s.chat}>
            <div style={{padding:'16px 24px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
              <div>
                <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:'20px',fontWeight:500,color:'var(--ivory)'}}>{selectedMember.display_name}</div>
                <div style={{fontSize:'11px',color:'var(--ivory-muted)',fontStyle:'italic',marginTop:'2px'}}>{selectedMember.discipline||'Explorer'} · {selectedMember.exp_tokens} EXP</div>
              </div>
              <button onClick={()=>setView('directory')} style={{background:'none',border:'1px solid var(--border)',color:'var(--ivory-muted)',fontFamily:'Cinzel,serif',fontSize:'10px',letterSpacing:'0.1em',padding:'4px 12px',cursor:'pointer',borderRadius:'2px'}}>← Directory</button>
            </div>

            <div style={{flex:1,overflowY:'auto',padding:'24px',display:'flex',flexDirection:'column',gap:'14px'}}>
              {messages.length===0 && (
                <div style={{textAlign:'center',padding:'48px',fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:'15px',color:'var(--text-muted)',lineHeight:1.8}}>
                  Begin your correspondence with {selectedMember.display_name}.<br/>
                  <span style={{fontSize:'12px',color:'var(--gold-dim)'}}>Messages are private and encrypted end-to-end.</span>
                </div>
              )}
              {messages.map(msg => {
                const isMe = msg.sender_id === currentMember?.id
                return (
                  <div key={msg.id} style={{display:'flex',flexDirection:isMe?'row-reverse':'row',gap:'10px',animation:'fadeUp 0.3s ease forwards'}}>
                    <div style={{width:'32px',height:'32px',borderRadius:'50%',background:isMe?'var(--sapphire)':'var(--bg-elevated)',border:'1px solid var(--border-bright)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cinzel,serif',fontSize:'11px',color:isMe?'#8ab0d8':'var(--gold)',flexShrink:0}}>
                      {isMe ? (currentMember?.display_name||'').slice(0,2).toUpperCase() : selectedMember.display_name.slice(0,2).toUpperCase()}
                    </div>
                    <div style={{maxWidth:'70%'}}>
                      <div style={{background:isMe?'linear-gradient(135deg,#1a2030,#12182a)':'var(--bg-elevated)',border:`1px solid ${isMe?'rgba(80,120,180,0.25)':'var(--border)'}`,borderRadius:isMe?'12px 2px 12px 12px':'2px 12px 12px 12px',padding:'10px 14px',fontSize:'15px',lineHeight:1.6,color:isMe?'#c8d8f0':'var(--text-primary)',whiteSpace:'pre-wrap'}}>
                        {msg.content}
                      </div>
                      <div style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'4px',textAlign:isMe?'right':'left',fontStyle:'italic'}}>
                        {new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={endRef}/>
            </div>

            <div style={{padding:'16px 24px',borderTop:'1px solid var(--border)',flexShrink:0,background:'linear-gradient(0deg,#070600,transparent)'}}>
              <div style={{display:'flex',gap:'10px',alignItems:'flex-end'}}>
                <textarea value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}}
                  placeholder={`Message ${selectedMember.display_name}...`}
                  disabled={sending} rows={1}
                  style={{flex:1,background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'6px',padding:'10px 14px',fontFamily:'EB Garamond,serif',fontSize:'15px',color:'var(--ivory)',resize:'none',outline:'none',minHeight:'44px',maxHeight:'120px',lineHeight:1.5}}/>
                <button onClick={sendMessage} disabled={sending} style={{padding:'10px 20px',height:'44px',background:'linear-gradient(135deg,#1c1500,#2a1e00)',border:'1px solid var(--gold-dim)',borderRadius:'4px',color:'var(--gold)',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.15em',cursor:'pointer'}}>Send</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
