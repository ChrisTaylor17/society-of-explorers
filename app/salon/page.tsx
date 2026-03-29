'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { getMemberSession } from '@/lib/auth/getSession';
import { useAccount, useWriteContract } from 'wagmi';
import { ritualMarketplaceABI } from '@/lib/contracts';
import { parseUnits } from 'viem';
const RITUAL_MARKETPLACE_ADDRESS = '0x16d70AdbB2eE47Ed8bD7bb342ae08b9C048e7B10';
export default function SalonPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [rituals, setRituals] = useState<any[]>([]);
  const [marketOpen, setMarketOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  useEffect(() => {
    getMemberSession().then(s => { if (!s) router.push('/'); });
    loadMessages();
    loadRituals();
  }, []);
  async function loadMessages() {
    const { data } = await supabase.from('salon_messages').select('*').order('created_at', { ascending: true });
    if (data) setMessages(data);
  }
  async function loadRituals() {
    setRituals([
      { id: 1, thinker: 'Einstein', name: 'Thought Experiment', price: 5, desc: 'Deep physics insight' },
      { id: 2, thinker: 'Jobs', name: 'Simplicity Ritual', price: 8, desc: 'Design & focus session' },
      { id: 3, thinker: 'Socrates', name: 'Question Everything', price: 3, desc: 'Truth-seeking dialogue' },
      { id: 4, thinker: 'Aurelius', name: 'Stoic Reflection', price: 4, desc: 'Daily virtue practice' },
      { id: 5, thinker: 'Nietzsche', name: 'Will to Power', price: 7, desc: 'Overcome & create' },
      { id: 6, thinker: 'Plato', name: 'Ideal Form', price: 6, desc: 'Vision & archetype work' },
    ]);
  }
  async function sendMessage() {
    if (!newMessage.trim()) return;
    const { data: member } = await supabase.from('members').select('display_name').eq('wallet', address).single();
    await supabase.from('salon_messages').insert({
      sender_type: 'member',
      sender_name: member?.display_name || 'Explorer',
      content: newMessage,
    });
    setMessages(prev => [...prev, { sender_type: 'member', sender_name: member?.display_name || 'Explorer', content: newMessage, created_at: new Date().toISOString() }]);
    setNewMessage('');
    loadMessages();
  }
  async function runRitual(ritual: any) {
    try {
      await writeContract({
        address: RITUAL_MARKETPLACE_ADDRESS,
        abi: ritualMarketplaceABI,
        functionName: 'accessRitual',
        args: [BigInt(ritual.id)],
        value: parseUnits(ritual.price.toString(), 18),
      });
      await supabase.from('salon_messages').insert({
        sender_type: 'system',
        content: `🪄 ${ritual.thinker} Ritual activated for ${ritual.price} $SOE`,
      });
      loadMessages();
    } catch (e) {
      console.error(e);
      alert('Transaction failed or rejected');
    }
  }
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex font-serif">
      {/* Sidebar */}
      <div className="w-72 bg-[#111827] p-6 flex flex-col border-r border-gold/20">
        <h1 className="text-3xl tracking-widest text-cyan-400 mb-12">SOCIETY OF EXPLORERS</h1>
        <div className="space-y-2">
          <button onClick={() => setMarketOpen(false)} className={`w-full text-left px-6 py-4 rounded-2xl transition-all ${!marketOpen ? 'bg-cyan-500 text-white' : 'hover:bg-zinc-800'}`}># general</button>
          <button onClick={() => setMarketOpen(true)} className={`w-full text-left px-6 py-4 rounded-2xl transition-all ${marketOpen ? 'bg-amber-500 text-white' : 'hover:bg-zinc-800'}`}>MARKET</button>
        </div>
      </div>
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="px-8 py-6 border-b border-gold/10 flex justify-between items-center">
          <div className="text-xl font-light text-gold">
            {marketOpen ? 'Ritual Marketplace' : 'The Salon of Great Minds'}
          </div>
          {address && <div className="text-xs text-zinc-400">Connected • {address.slice(0,6)}...{address.slice(-4)}</div>}
        </div>
        {marketOpen ? (
          <div className="flex-1 p-8 grid grid-cols-2 gap-6 overflow-auto">
            {rituals.map((r) => (
              <div key={r.id} className="bg-zinc-900 border border-gold/30 rounded-3xl p-6 hover:border-amber-400 transition-all">
                <div className="text-amber-400 text-sm mb-2">{r.thinker}</div>
                <div className="text-2xl font-light mb-3">{r.name}</div>
                <div className="text-zinc-400 mb-6">{r.desc}</div>
                <button
                  onClick={() => runRitual(r)}
                  className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-2xl font-medium text-lg hover:brightness-110 transition"
                >
                  Run Ritual • {r.price} $SOE
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 p-8 overflow-auto space-y-8" id="chat">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender_type === 'member' ? 'justify-end' : ''}`}>
                <div className={`max-w-[75%] px-6 py-4 rounded-3xl ${m.sender_type === 'member' ? 'bg-cyan-600' : 'bg-zinc-800 border border-gold/20'}`}>
                  <div className="text-xs opacity-60 mb-1">{m.sender_name || 'Thinker'} • {new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                  <div className="leading-relaxed">{m.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!marketOpen && (
          <div className="p-6 border-t border-gold/10 flex gap-4">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-zinc-900 border border-gold/30 rounded-3xl px-6 py-5 focus:outline-none text-lg"
              placeholder="Speak to the salon..."
            />
            <button onClick={sendMessage} className="bg-cyan-500 px-10 rounded-3xl font-medium">Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
