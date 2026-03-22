'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setWalletCookie } from '@/lib/auth/getSession'

export default function LoginPage() {
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [isSignUp,setIsSignUp]=useState(false)
  const [loading,setLoading]=useState(false)
  const [walletLoading,setWalletLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const router=useRouter()
  const supabase=createClient()

  async function handleEmailSubmit(e:React.FormEvent){
    e.preventDefault();setLoading(true);setError('');setMessage('')
    if(isSignUp){
      const{error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:'https://societyofexplorers.com/salon'}})
      if(error)setError(error.message);else setMessage('Check your email to confirm, then sign in.')
    } else {
      const{error}=await supabase.auth.signInWithPassword({email,password})
      if(error)setError(error.message);else router.push('/salon')
    }
    setLoading(false)
  }

  async function connectWallet() {
    setWalletLoading(true);setError('')
    try {
      const eth = (window as any).ethereum
      if (!eth) { setError('MetaMask not found. Install the MetaMask extension first.'); setWalletLoading(false); return }

      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      if (!accounts?.length) { setError('No accounts found. Unlock MetaMask and try again.'); setWalletLoading(false); return }

      const rawAddress = accounts[0]

      // Checksum the address using EIP-55 (ethers.js getAddress does this)
      const { ethers } = await import('ethers')
      const address = ethers.getAddress(rawAddress) // returns proper checksummed address

      const nonceRes = await fetch('/api/auth/nonce')
      const { nonce } = await nonceRes.json()

      const { SiweMessage } = await import('siwe')
      const siweMsg = new SiweMessage({
        domain: window.location.host,
        address, // checksummed
        statement: 'Sign in to Society of Explorers.',
        uri: window.location.origin,
        version: '1',
        chainId: 1,
        nonce,
      })
      const msgStr = siweMsg.prepareMessage()

      const signature = await eth.request({ method: 'personal_sign', params: [msgStr, address] })

      const res = await fetch('/api/auth/siwe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgStr, signature, address })
      })
      const data = await res.json()

      if (data.verified && data.member) {
        setWalletCookie(data.member.id)
localStorage.setItem('soe_wallet', JSON.stringify(data.member))
        router.push('/salon')
      } else {
        setError(data.error || 'Verification failed.')
      }
    } catch(e:any) {
      if (e.code === 4001) setError('Signature cancelled. Please sign the message to enter the salon.')
      else setError(e.message || 'Wallet connection failed.')
      console.error('Wallet error:', e)
    }
    setWalletLoading(false)
  }

  const inp:React.CSSProperties={width:'100%',background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'3px',padding:'10px 14px',color:'var(--ivory)',fontFamily:'EB Garamond,serif',fontSize:'15px',outline:'none'}
  const lbl:React.CSSProperties={display:'block',fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.25em',color:'var(--gold-dim)',textTransform:'uppercase',marginBottom:'7px'}

  return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px',background:'var(--bg-void)'}}>
      <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at center,rgba(200,168,75,0.04) 0%,transparent 70%)',pointerEvents:'none'}}/>
      <div style={{textAlign:'center',marginBottom:'40px'}}>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.4em',color:'var(--gold-dim)',marginBottom:'14px'}}>Est. 2026 · Boston</div>
        <h1 style={{fontFamily:'Cinzel,serif',fontSize:'clamp(24px,5vw,42px)',fontWeight:400,color:'var(--gold-light)',letterSpacing:'0.15em',textShadow:'0 0 40px rgba(200,168,75,0.3)',marginBottom:'8px'}}>Society of Explorers</h1>
        <p style={{fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:'18px',color:'var(--ivory-muted)'}}>Where great minds converge across time</p>
        <div style={{margin:'18px auto',width:'200px',height:'1px',background:'linear-gradient(90deg,transparent,var(--gold-dim),transparent)'}}/>
      </div>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-bright)',borderRadius:'4px',padding:'36px',width:'100%',maxWidth:'440px',boxShadow:'0 30px 80px rgba(0,0,0,0.8)'}}>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',letterSpacing:'0.3em',color:'var(--gold-dim)',textTransform:'uppercase',marginBottom:'24px',textAlign:'center'}}>{isSignUp?'Request Admission':'Enter the Salon'}</div>

        <div style={{marginBottom:'20px'}}>
          <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.25em',color:'var(--gold-dim)',textTransform:'uppercase',marginBottom:'10px'}}>Connect Wallet</div>
          <button onClick={connectWallet} disabled={walletLoading} style={{width:'100%',padding:'12px',background:'linear-gradient(135deg,#0a1220,#111a2e)',border:'1px solid rgba(100,150,220,0.4)',borderRadius:'3px',color:'#8ab0d8',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.15em',cursor:walletLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'10px',opacity:walletLoading?0.7:1}}>
            <span style={{fontSize:'18px'}}>🦊</span>
            {walletLoading?'Connecting...':'MetaMask / Browser Wallet'}
          </button>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:'12px',margin:'16px 0'}}><div style={{flex:1,height:'1px',background:'var(--border)'}}/><span style={{fontSize:'11px',color:'var(--text-muted)',fontStyle:'italic'}}>or</span><div style={{flex:1,height:'1px',background:'var(--border)'}}/></div>

        <form onSubmit={handleEmailSubmit}>
          <div style={{marginBottom:'14px'}}><label style={lbl}>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="your@email.com" style={inp}/></div>
          <div style={{marginBottom:'20px'}}><label style={lbl}>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" style={inp}/></div>
          {error&&<div style={{color:'#c47',fontSize:'13px',marginBottom:'14px',fontStyle:'italic',textAlign:'center'}}>{error}</div>}
          {message&&<div style={{color:'var(--gold)',fontSize:'13px',marginBottom:'14px',fontStyle:'italic',textAlign:'center'}}>{message}</div>}
          <button type="submit" disabled={loading} style={{width:'100%',padding:'12px',background:'linear-gradient(135deg,#1c1500,#2a1e00)',border:'1px solid var(--gold-dim)',borderRadius:'3px',color:'var(--gold)',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.2em',textTransform:'uppercase',cursor:'pointer'}}>
            {loading?'One moment...':isSignUp?'Request Admission':'Enter the Salon'}
          </button>
        </form>

        <div style={{display:'flex',alignItems:'center',gap:'12px',margin:'16px 0'}}><div style={{flex:1,height:'1px',background:'var(--border)'}}/><span style={{fontSize:'11px',color:'var(--text-muted)',fontStyle:'italic'}}>or</span><div style={{flex:1,height:'1px',background:'var(--border)'}}/></div>
        <button onClick={()=>{setIsSignUp(!isSignUp);setError('');setMessage('')}} style={{width:'100%',padding:'10px',background:'transparent',border:'1px solid var(--border)',borderRadius:'3px',color:'var(--ivory-muted)',fontFamily:'Cormorant Garamond,serif',fontSize:'14px',fontStyle:'italic',cursor:'pointer'}}>
          {isSignUp?'Already a member? Enter the salon':'New to the Society? Request admission'}
        </button>
      </div>
      <div style={{marginTop:'28px',textAlign:'center',fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:'12px',color:'var(--text-muted)',lineHeight:1.8}}>
        <div>92B South St · Downtown Boston</div>
        <div style={{marginTop:'4px',color:'var(--gold-dim)',fontSize:'11px',fontStyle:'normal',fontFamily:'Cinzel,serif',letterSpacing:'0.1em'}}>Consilience LLC · Society of Explorers DAO</div>
      <div style={{marginTop:'12px'}}><a href="/join" style={{color:'var(--gold)',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.15em',textDecoration:'none'}}>VIEW MEMBERSHIP OPTIONS →</a></div>
      </div>
    </div>
  )
}
