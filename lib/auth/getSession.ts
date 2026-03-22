import { createClient } from '@/lib/supabase/client'

export async function getMemberSession() {
  if (typeof window === 'undefined') return null
  const supabase = createClient()

  // Try Supabase email session
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: member } = await supabase
      .from('members').select('*').eq('supabase_auth_id', user.id).single()
    if (member) return { member, supabase }
  }

  // Try cookie first, then localStorage (MetaMask browser blocks cookies)
  const walletId = getCookie('soe_wallet_id') || localStorage.getItem('soe_wallet_id')
  if (walletId) {
    const { data: member } = await supabase
      .from('members').select('*').eq('id', walletId).single()
    if (member) return { member, supabase }
    deleteCookie('soe_wallet_id')
    localStorage.removeItem('soe_wallet_id')
  }

  return null
}

export function setWalletCookie(memberId: string) {
  // Set both cookie AND localStorage — MetaMask in-app browser can block cookies
  // SameSite=None;Secure is required for cross-origin WebView contexts (MetaMask iOS)
  try { document.cookie = `soe_wallet_id=${memberId};path=/;max-age=${60*60*24*30};SameSite=None;Secure` } catch(e) {}
  try { localStorage.setItem('soe_wallet_id', memberId) } catch(e) {}
}
export function clearWalletStorage() {
  try { document.cookie = 'soe_wallet_id=;path=/;max-age=0' } catch(e) {}
  try { localStorage.removeItem('soe_wallet_id') } catch(e) {}
}

export function clearWalletCookie() {
  document.cookie = 'soe_wallet_id=;path=/;max-age=0'
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;path=/;max-age=0`
}
