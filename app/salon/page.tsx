'use client'
import{useState,useEffect,useRef,useCallback}from 'react'
import{createClient}from '@/lib/supabase/client'
import{useRouter}from 'next/navigation'
import{THINKER_PROFILES}from '@/lib/claude/thinkers'
import{getMemberSession,clearWalletCookie}from '@/lib/auth/getSession'
interface Message{id:string;created_at:string;sender_type:'member'|'thinker'|'system';sender_name:string;thinker_id?:string;content:string}
interface Member{id:string;display_name:string;exp_tokens:number;member_rank:string}
const THINKERS=Object.values(THINKER_PROFILES)
export default function SalonPage(){
  const[messages,setMessages]=useState<Message[]>([])
  const[input,setInput]=useState('')
  const[selectedThinker,setSelectedThinker]=useState(THINKERS[0])
  const[member,setMember]=useState<Member|null>(null)
  const[isLoading,setIsLoading]=useState(false)
  const[authReady,setAuthReady]=useState(false)
  const[mobileView,setMobileView]=useState<'thinkers'|'chat'|'exp'>('chat')
  const[showThinkers,setShowThinkers]=useState(false)
  const endRef=useRef<HTMLDivElement>(null)
  const lastActivityRef=useRef(Date.now())
  const bgCountRef=useRef(0)
  const router=useRouter()
  const supabase=createClient()

  useEffect(()=>{
    getMemberSession().then(session=>{
      if(!session){router.push('/');return}
      setMember(session.member)
      setAuthReady(true)
    })
  },[])

  useEffect(()=>{supabase.from('salon_messages').select('*').order('created_at',{ascending:true}).limit(60).then(({data})=>{if(data)setMessages(data)})},[])
  useEffect(()=>{
    const ch=supabase.channel('salon').on('postgres_changes',{event:'INSERT',schema:'public',table:'salon_messages'},(p)=>{setMessages(prev=>[...prev,p.new as Message])}).subscribe()
    return()=>{supabase.removeChannel(ch)}
  },[])
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[messages])

  const triggerBg=useCallback(async()=>{
    const idle=(Date.now()-lastActivityRef.current)/1000
    if(isLoading||idle<120||messages.length<2||bgCountRef.current>=2)return
    const recent=messages.slice(-4).map(m=>m.sender_name)
    const avail=THINKERS.filter(t=>!recent.includes(t.name))
    if(!avail.length)return
    const t=avail[Math.floor(Math.random()*avail.length)];bgCountRef.current++
    await fetch('/api/thinker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({thinkerId:t.id,message:null,history:messages.slice(-10),isReaction:true,walletMemberId:member?.id})})
  },[isLoading,messages,member])
  useEffect(()=>{const i=setInterval(triggerBg,60000);return()=>clearInterval(i)},[triggerBg])

  async function send(){
    if(!input.trim()||isLoading)return
    const text=input.trim();setInput('');setIsLoading(true)
    lastActivityRef.current=Date.now();bgCountRef.current=0
    await supabase.from('salon_messages').insert({sender_type:'member',sender_name:member?.display_name||'You',sender_id:member?.id,content:text})
    await fetch('/api/thinker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({thinkerId:selectedThinker.id,message:text,history:messages.slice(-12),isReaction:false,walletMemberId:member?.id})})
if(member){const{data}=await supabase.from('members').select('exp_tokens,member_rank').eq('id',member.id).single();if(data)setMember(p=>p?{...p,...data}:p)}
    setIsLoading(false)
  }

  async function signOut(){
    await supabase.auth.signOut()
    localStorage.removeItem('soe_wallet')
    localStorage.removeItem('soe_wallet_id')
    clearWalletCookie()
    router.push('/')
  }

  function rank(e:number){if(e>=2000)return'Elder';if(e>=1000)return'Master';if(e>=600)return'Fellow';if(e>=300)return'Scholar';if(e>=100)return'Seeker';return'Initiate'}

  if(!authReady)return(<div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-void)'}}><div style={{fontFamily:'Cinzel,serif',fontSize:'12px',letterSpacing:'0.3em',color:'var(--gold-dim)'}}>ENTERING THE SALON...</div></div>)

  return(
    <div className="salon-root" style={{display:'flex',flexDirection:'column',background:'var(--bg-void)',overflow:'hidden'}}>
      {/* TOPBAR */}
      <div style={{height:'52px',background:'linear-gradient(180deg,#0a0900,var(--bg-deep))',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',flexShrink:0,position:'relative',zIndex:10}}>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:'1px',background:'linear-gradient(90deg,transparent,var(--gold-dim),var(--gold),var(--gold-dim),transparent)'}}/>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'13px',letterSpacing:'0.2em',color:'var(--gold)'}}>Society of Explorers</div>
        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
          <button onClick={()=>setShowThinkers(!showThinkers)} style={{background:'none',border:'1px solid var(--border)',color:'var(--gold-dim)',fontSize:'10px',fontFamily:'Cinzel,serif',letterSpacing:'0.08em',padding:'3px 8px',cursor:'pointer',borderRadius:'2px'}}>MINDS</button>
          <button onClick={()=>router.push('/members')} style={{background:'none',border:'1px solid var(--border)',color:'var(--gold-dim)',fontSize:'10px',fontFamily:'Cinzel,serif',letterSpacing:'0.08em',padding:'3px 8px',cursor:'pointer',borderRadius:'2px'}}>MEMBERS</button>
          <button onClick={()=>router.push('/book')} style={{background:'none',border:'1px solid var(--border)',color:'var(--gold-dim)',fontSize:'10px',fontFamily:'Cinzel,serif',letterSpacing:'0.08em',padding:'3px 8px',cursor:'pointer',borderRadius:'2px'}}>BOOK</button>
          <button onClick={signOut} style={{background:'none',border:'1px solid var(--border)',color:'var(--gold-dim)',fontSize:'10px',fontFamily:'Cinzel,serif',letterSpacing:'0.08em',padding:'3px 8px',cursor:'pointer',borderRadius:'2px'}}>LEAVE</button>
        </div>
      </div>

      {/* THINKER DROPDOWN - mobile */}
      {showThinkers&&(
        <div style={{position:'absolute',top:'52px',left:0,right:0,background:'var(--bg-panel)',borderBottom:'1px solid var(--border)',zIndex:20,padding:'8px 0'}}>
          {THINKERS.map(t=>(
            <div key={t.id} onClick={()=>{setSelectedThinker(t);setShowThinkers(false)}} style={{padding:'12px 16px',cursor:'pointer',borderLeft:`2px solid ${selectedThinker.id===t.id?'var(--gold)':'transparent'}`,background:selectedThinker.id===t.id?'var(--glow)':'transparent',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontFamily:'Cormorant Garamond,serif',fontSize:'16px',color:selectedThinker.id===t.id?'var(--gold-light)':'var(--ivory)'}}>{t.name}</span>
              <span style={{fontSize:'10px',color:'var(--ivory-muted)'}}>{t.era.split('·')[0].trim()}</span>
            </div>
          ))}
        </div>
      )}

      {/* CHAT AREA */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
        {/* Chat header */}
        <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--bg-deep)'}}>
          <div>
            <div style={{fontFamily:'Cinzel,serif',fontSize:'13px',color:'var(--gold-light)',letterSpacing:'0.1em'}}>The Salon of Great Minds</div>
            <div style={{fontSize:'11px',color:'var(--ivory-muted)',fontStyle:'italic',marginTop:'1px',fontFamily:'Cormorant Garamond,serif'}}>Addressing {selectedThinker.name}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:'Cinzel,serif',fontSize:'18px',color:'var(--gold-light)'}}>{member?.exp_tokens||0}</div>
            <div style={{fontSize:'9px',color:'var(--ivory-muted)',letterSpacing:'0.15em'}}>EXP · {rank(member?.exp_tokens||0)}</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'16px',background:'var(--bg-deep)'}}>
          {messages.length===0&&(
            <div style={{textAlign:'center',padding:'32px 16px',fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:'15px',color:'var(--text-muted)',lineHeight:1.8}}>
              Welcome to the Salon.<br/>
              <span style={{fontSize:'13px',color:'var(--gold-dim)'}}>Tap MINDS to choose a thinker, then speak.</span>
            </div>
          )}
          {messages.map(msg=>(
            <div key={msg.id} style={{display:'flex',gap:'10px',flexDirection:msg.sender_type==='member'?'row-reverse':'row',justifyContent:msg.sender_type==='system'?'center':undefined}}>
              {msg.sender_type==='system'?(
                <div style={{fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:'11px',color:'var(--gold-dim)',padding:'4px 12px',borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)',background:'var(--glow)',textAlign:'center'}} dangerouslySetInnerHTML={{__html:msg.content}}/>
              ):(
                <>
                  <div style={{width:'32px',height:'32px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cinzel,serif',fontSize:'11px',fontWeight:600,flexShrink:0,marginTop:'2px',border:'1px solid var(--border-bright)',background:msg.sender_type==='member'?'var(--sapphire)':'var(--bg-elevated)',color:msg.sender_type==='member'?'#8ab0d8':'var(--gold)'}}>
                    {msg.sender_type==='member'?msg.sender_name.slice(0,2).toUpperCase():msg.sender_name.slice(0,2)}
                  </div>
                  <div style={{flex:1,maxWidth:'80%'}}>
                    <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.15em',color:msg.sender_type==='member'?'rgba(100,150,200,0.6)':'var(--gold-dim)',marginBottom:'4px',textTransform:'uppercase'}}>{msg.sender_name}</div>
                    <div style={{background:msg.sender_type==='member'?'linear-gradient(135deg,#1a2030,#12182a)':'var(--bg-elevated)',border:`1px solid ${msg.sender_type==='member'?'rgba(80,120,180,0.25)':'var(--border)'}`,borderRadius:msg.sender_type==='member'?'12px 2px 12px 12px':'2px 12px 12px 12px',padding:'10px 14px',fontSize:'15px',lineHeight:1.65,color:msg.sender_type==='member'?'#c8d8f0':'var(--text-primary)',whiteSpace:'pre-wrap'}}>
                      {msg.content}
                    </div>
                    <div style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'4px',fontStyle:'italic'}}>{new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                </>
              )}
            </div>
          ))}
          {isLoading&&(
            <div style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
              <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'var(--bg-elevated)',border:'1px solid var(--border-bright)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cinzel,serif',fontSize:'11px',color:'var(--gold)',flexShrink:0}}>{selectedThinker.avatar}</div>
              <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'2px 12px 12px 12px',padding:'10px 14px',display:'flex',gap:'4px',alignItems:'center'}}>
                {[0,0.2,0.4].map((d,i)=><div key={i} style={{width:'5px',height:'5px',borderRadius:'50%',background:'var(--gold-dim)',animation:`typing 1.2s ${d}s ease-in-out infinite`}}/>)}
              </div>
            </div>
          )}
          <div ref={endRef}/>
        </div>

        {/* Input */}
        <div className="salon-input-area" style={{paddingTop:'12px',paddingLeft:'16px',paddingRight:'16px',borderTop:'1px solid var(--border)',flexShrink:0,background:'linear-gradient(0deg,#070600,var(--bg-deep))'}}>
          <div style={{display:'flex',gap:'8px',alignItems:'flex-end'}}>
            <textarea value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,100)+'px'}}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()};lastActivityRef.current=Date.now();bgCountRef.current=0}}
              placeholder={`Speak to ${selectedThinker.name}...`} disabled={isLoading} rows={1}
              style={{flex:1,background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'6px',padding:'10px 14px',fontFamily:'EB Garamond,serif',fontSize:'16px',color:'var(--ivory)',resize:'none',outline:'none',minHeight:'44px',maxHeight:'100px',lineHeight:1.5,WebkitAppearance:'none'}}/>
            <button onClick={send} disabled={isLoading} style={{padding:'10px 16px',height:'44px',background:'linear-gradient(135deg,#1c1500,#2a1e00)',border:'1px solid var(--gold-dim)',borderRadius:'4px',color:'var(--gold)',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.15em',cursor:isLoading?'not-allowed':'pointer',flexShrink:0}}>SPEAK</button>
          </div>
        </div>
      </div>
    </div>
  )
}
