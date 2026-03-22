'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Member { id:string; display_name:string; discipline?:string }
interface Booking { id:string; created_at:string; member_id:string; visit_type:string; scheduled_for:string; notes?:string; status:string; member?:Member; with_member?:Member }

const VISIT_TYPES = [
  { id:'salon', label:'Open Salon Evening', desc:'Join the community for an evening of ideas', icon:'◈' },
  { id:'collab', label:'Collaboration Session', desc:'Work with another member on a shared project', icon:'⟡' },
  { id:'workshop', label:'Workshop / Seminar', desc:'Host or attend a focused learning session', icon:'◎' },
  { id:'private', label:'Private Meeting', desc:'A quiet space for focused individual work', icon:'◇' },
  { id:'tour', label:'Space Tour', desc:'See the salon for the first time', icon:'✦' },
]

export default function BookPage() {
  const [currentMember, setCurrentMember] = useState<Member|null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [visitType, setVisitType] = useState('')
  const [date, setDate] = useState('')
  const [withMember, setWithMember] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState<'book'|'upcoming'>('book')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      supabase.from('members').select('id,display_name,discipline').eq('supabase_auth_id', user.id).single()
        .then(({ data }) => { if (data) { setCurrentMember(data); loadBookings(data.id) } })
    })
    supabase.from('members').select('id,display_name,discipline').order('display_name')
      .then(({ data }) => { if (data) setMembers(data) })
  }, [])

  async function loadBookings(memberId: string) {
    const { data } = await supabase.from('bookings')
      .select('*, member:member_id(id,display_name), with_member:with_member_id(id,display_name)')
      .or(`member_id.eq.${memberId},with_member_id.eq.${memberId}`)
      .gte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
    if (data) setBookings(data as any)
  }

  async function book() {
    if (!visitType || !date || !currentMember) return
    setLoading(true); setSuccess('')
    const { error } = await supabase.from('bookings').insert({
      member_id: currentMember.id,
      visit_type: visitType,
      scheduled_for: new Date(date).toISOString(),
      with_member_id: withMember || null,
      notes: notes || null,
    })
    if (!error) {
      setSuccess(`Your ${VISIT_TYPES.find(v=>v.id===visitType)?.label} has been reserved. We look forward to welcoming you to 92B South St.`)
      setVisitType(''); setDate(''); setWithMember(''); setNotes('')
      loadBookings(currentMember.id)
      setTab('upcoming')
    }
    setLoading(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', { weekday:'long', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
  }

  const btn = (active: boolean): React.CSSProperties => ({ padding:'6px 18px', background: active ? 'var(--glow)' : 'transparent', border:'1px solid ' + (active ? 'var(--gold-dim)' : 'var(--border)'), color: active ? 'var(--gold)' : 'var(--ivory-muted)', fontFamily:'Cinzel,serif', fontSize:'10px', letterSpacing:'0.15em', cursor:'pointer', borderRadius:'2px' })
  const lbl: React.CSSProperties = { display:'block', fontFamily:'Cinzel,serif', fontSize:'9px', letterSpacing:'0.25em', color:'var(--gold-dim)', textTransform:'uppercase', marginBottom:'8px' }
  const inp: React.CSSProperties = { width:'100%', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'3px', padding:'10px 14px', color:'var(--ivory)', fontFamily:'EB Garamond,serif', fontSize:'15px', outline:'none' }

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg-void)' }}>
      {/* topbar */}
      <div style={{ height:'52px', background:'linear-gradient(180deg,#0a0900,var(--bg-deep))', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', flexShrink:0, position:'relative' }}>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'1px', background:'linear-gradient(90deg,transparent,var(--gold-dim),var(--gold),var(--gold-dim),transparent)' }}/>
        <div style={{ fontFamily:'Cinzel,serif', fontSize:'13px', letterSpacing:'0.25em', color:'var(--gold)' }}>Society of Explorers</div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button style={btn(false)} onClick={()=>router.push('/salon')}>The Salon</button>
          <button style={btn(false)} onClick={()=>router.push('/members')}>Members</button>
          <button style={btn(true)}>Book Space</button>
        </div>
        <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'12px', color:'var(--ivory-muted)', fontStyle:'italic' }}>📍 92B South St · Downtown Boston</div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'40px 48px' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:'40px' }}>
          <div style={{ fontFamily:'Cinzel,serif', fontSize:'10px', letterSpacing:'0.35em', color:'var(--gold-dim)', marginBottom:'10px' }}>THE BOSTON SALON</div>
          <h1 style={{ fontFamily:'Cinzel,serif', fontSize:'28px', fontWeight:400, color:'var(--gold-light)', letterSpacing:'0.12em', marginBottom:'8px' }}>92B South Street</h1>
          <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:'16px', color:'var(--ivory-muted)' }}>Downtown Boston · Private Members Space</p>
          <div style={{ margin:'16px auto', width:'200px', height:'1px', background:'linear-gradient(90deg,transparent,var(--gold-dim),transparent)' }}/>
          <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'15px', color:'var(--text-secondary)', maxWidth:'500px', margin:'0 auto', lineHeight:1.7 }}>
            A space for beauty and the pursuit of truth. Available to Society members for collaboration, thought, and connection.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'32px', justifyContent:'center' }}>
          <button style={btn(tab==='book')} onClick={()=>setTab('book')}>Reserve a Visit</button>
          <button style={btn(tab==='upcoming')} onClick={()=>setTab('upcoming')}>Upcoming ({bookings.length})</button>
        </div>

        {tab === 'book' && (
          <div style={{ maxWidth:'600px', margin:'0 auto' }}>
            {/* Visit type */}
            <div style={{ marginBottom:'28px' }}>
              <label style={lbl}>Type of Visit</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                {VISIT_TYPES.map(vt => (
                  <div key={vt.id} onClick={()=>setVisitType(vt.id)}
                    style={{ padding:'14px 16px', background: visitType===vt.id ? 'linear-gradient(135deg,#1c1500,#2a1e00)' : 'var(--bg-elevated)', border:`1px solid ${visitType===vt.id ? 'var(--gold-dim)' : 'var(--border)'}`, borderRadius:'4px', cursor:'pointer', transition:'all 0.2s' }}>
                    <div style={{ fontSize:'16px', marginBottom:'4px' }}>{vt.icon}</div>
                    <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'15px', fontWeight:500, color: visitType===vt.id ? 'var(--gold-light)' : 'var(--ivory)' }}>{vt.label}</div>
                    <div style={{ fontSize:'11px', color:'var(--ivory-muted)', marginTop:'3px', lineHeight:1.4 }}>{vt.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Date */}
            <div style={{ marginBottom:'20px' }}>
              <label style={lbl}>Date & Time</label>
              <input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}
                style={{ ...inp, colorScheme:'dark' }} min={new Date().toISOString().slice(0,16)} />
            </div>

            {/* With member */}
            <div style={{ marginBottom:'20px' }}>
              <label style={lbl}>Meet with (optional)</label>
              <select value={withMember} onChange={e=>setWithMember(e.target.value)} style={{ ...inp, appearance:'none', cursor:'pointer' }}>
                <option value="" style={{ background:'#111' }}>Open visit — no specific member</option>
                {members.filter(m=>m.id!==currentMember?.id).map(m => (
                  <option key={m.id} value={m.id} style={{ background:'#111' }}>{m.display_name}{m.discipline ? ` · ${m.discipline}` : ''}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div style={{ marginBottom:'28px' }}>
              <label style={lbl}>Notes (optional)</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
                placeholder="Topics to discuss, equipment needed, anything we should know..."
                style={{ ...inp, resize:'vertical', lineHeight:1.5 }} />
            </div>

            {success && (
              <div style={{ padding:'16px', background:'linear-gradient(135deg,var(--bg-elevated),#0e1a0e)', border:'1px solid rgba(30,100,50,0.4)', borderRadius:'4px', marginBottom:'20px', fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:'14px', color:'#6abf8a', lineHeight:1.6 }}>
                ✦ {success}
              </div>
            )}

            <button onClick={book} disabled={loading || !visitType || !date}
              style={{ width:'100%', padding:'14px', background: (!visitType||!date) ? 'var(--bg-elevated)' : 'linear-gradient(135deg,#1c1500,#2a1e00)', border:`1px solid ${(!visitType||!date) ? 'var(--border)' : 'var(--gold-dim)'}`, borderRadius:'3px', color: (!visitType||!date) ? 'var(--text-muted)' : 'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'12px', letterSpacing:'0.2em', cursor: (!visitType||!date) ? 'not-allowed' : 'pointer', transition:'all 0.3s' }}>
              {loading ? 'Reserving...' : 'Reserve My Place'}
            </button>
          </div>
        )}

        {tab === 'upcoming' && (
          <div style={{ maxWidth:'700px', margin:'0 auto' }}>
            {bookings.length === 0 ? (
              <div style={{ textAlign:'center', padding:'64px', fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:'18px', color:'var(--text-muted)', lineHeight:1.8 }}>
                No upcoming visits reserved.<br/>
                <span style={{ fontSize:'14px', color:'var(--gold-dim)' }}>The salon awaits your presence.</span>
              </div>
            ) : bookings.map(b => {
              const vt = VISIT_TYPES.find(v=>v.id===b.visit_type)
              return (
                <div key={b.id} style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:'4px', padding:'20px 24px', marginBottom:'12px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
                      <span style={{ fontSize:'18px' }}>{vt?.icon}</span>
                      <span style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'18px', fontWeight:500, color:'var(--ivory)' }}>{vt?.label}</span>
                    </div>
                    <div style={{ fontFamily:'Cinzel,serif', fontSize:'10px', letterSpacing:'0.15em', color:'var(--gold)', marginBottom:'6px' }}>{formatDate(b.scheduled_for)}</div>
                    {(b as any).with_member && <div style={{ fontSize:'13px', color:'var(--ivory-muted)', marginBottom:'4px' }}>With: {(b as any).with_member.display_name}</div>}
                    {b.notes && <div style={{ fontSize:'13px', color:'var(--text-secondary)', fontStyle:'italic' }}>"{b.notes}"</div>}
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:'10px', padding:'4px 10px', background:'var(--emerald)', borderRadius:'2px', color:'#6abf8a', fontFamily:'Cinzel,serif', letterSpacing:'0.1em' }}>CONFIRMED</div>
                    <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'8px', fontStyle:'italic' }}>92B South St</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
