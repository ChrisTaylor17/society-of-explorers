'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import HubOverlay from './HubOverlay';
import MerchOverlay from './MerchOverlay';
import SalonOnboarding from './SalonOnboarding';
import { renderMarkdown } from '@/lib/renderMarkdown';
import { speakText, stopSpeaking } from '@/lib/tts';
import { initAudioUnlock } from '@/lib/audioUnlock';
import { startRecording, stopRecording, isRecordingNow } from '@/lib/voiceRecorder';
import ArtifactGenerator from '@/components/ArtifactGenerator';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { getMemberSession, clearWalletCookie } from '@/lib/auth/getSession';
import { useAccount, useWriteContract, useSwitchChain } from 'wagmi';
import {
  ritualMarketplaceABI, erc20ABI, societyNFTABI,
  RITUAL_MARKETPLACE_ADDRESS, MOCK_SOE_ADDRESS, SOCIETY_NFT_ADDRESS,
} from '@/lib/contracts';
import { createPublicClient, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';

// ── Public client for on-chain reads ────────────────────────────────────────
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const NFT_DEPLOYED = SOCIETY_NFT_ADDRESS !== NULL_ADDRESS;

// ── Static data ──────────────────────────────────────────────────────────────
const THINKERS = [
  { id: 'socrates',  name: 'Socrates',  avatar: 'SO', era: 'Ancient Greece · 470 BC' },
  { id: 'einstein',  name: 'Einstein',  avatar: 'AE', era: 'Modern Physics · 1879' },
  { id: 'jobs',      name: 'Jobs',      avatar: 'SJ', era: 'Silicon Valley · 1955' },
  { id: 'aurelius',  name: 'Aurelius',  avatar: 'MA', era: 'Roman Empire · 121 AD' },
  { id: 'nietzsche', name: 'Nietzsche', avatar: 'FN', era: 'Modern Philosophy · 1844' },
  { id: 'plato',     name: 'Plato',     avatar: 'PL', era: 'Ancient Greece · 428 BC' },
];

const RITUALS = [
  { id: 1, thinker: 'Einstein', name: 'Thought Experiment', price: 5,  tagline: 'Bend reality through imagination.' },
  { id: 2, thinker: 'Jobs',     name: 'Simplicity Ritual',  price: 8,  tagline: 'Strip away the unnecessary.' },
  { id: 3, thinker: 'Socrates', name: 'Question Everything',price: 3,  tagline: 'The unexamined life is not worth living.' },
  { id: 4, thinker: 'Aurelius', name: 'Stoic Reflection',   price: 4,  tagline: 'The obstacle is the way.' },
  { id: 5, thinker: 'Nietzsche',name: 'Will to Power',      price: 7,  tagline: 'Become who you are.' },
  { id: 6, thinker: 'Plato',    name: 'Ideal Form',         price: 6,  tagline: 'Ascend toward the eternal.' },
];

const NFT_MINT_PRICE = 10; // $SOE

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id?: string;
  created_at: string;
  salon_id?: string;
  sender_type: 'member' | 'thinker' | 'system';
  sender_name: string;
  thinker_id?: string;
  content: string;
}

interface Member {
  id: string;
  display_name: string;
  exp_tokens: number;
  member_rank: string;
}

interface NFTToken {
  id: bigint;
  name: string;
  artifactType: string;
  color: string;
  image: string; // base64 SVG data URI
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SalonPage() {
  // ── Chat state ──────────────────────────────────────────────
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [input,           setInput]           = useState('');
  const [selectedThinker, setSelectedThinker] = useState(THINKERS[0]);
  const [member,          setMember]          = useState<Member | null>(null);
  const [isLoading,       setIsLoading]       = useState(false);
  const [authReady,       setAuthReady]       = useState(false);
  const [showOnboarding,  setShowOnboarding]  = useState(false);
  const [showMoreNav,     setShowMoreNav]     = useState(false);
  const [privateMode,     setPrivateMode]     = useState(false);
  const [ritualStream,    setRitualStream]    = useState('');
  const [ritualActive,    setRitualActive]    = useState<string | null>(null);
  const [ritualArtifact,  setRitualArtifact]  = useState<{title: string, thinker: string} | null>(null);
  const [voiceMode,       setVoiceMode]       = useState(false);
  const [isListening,     setIsListening]     = useState(false);
  const [interimText,     setInterimText]     = useState('');

  // Sentence-level TTS streaming
  const sentenceQueueRef = useRef<string[]>([]);
  const ttsBufferRef = useRef('');
  const isSpeakingRef = useRef(false);
  const [toasts,          setToasts]          = useState<{id: number; text: string}[]>([]);

  // ── Nav overlays ────────────────────────────────────────────
  const [showThinkers,  setShowThinkers]  = useState(false);
  const [showMarket,    setShowMarket]    = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showHub,       setShowHub]       = useState(false);
  const [showMerch,     setShowMerch]     = useState(false);

  // ── Ritual tx state ─────────────────────────────────────────
  const [ritualTx, setRitualTx] = useState<{
    status: 'idle' | 'approving' | 'pending' | 'success' | 'error';
    hash?: string; error?: string; ritualId?: number;
  }>({ status: 'idle' });

  // ── NFT state ───────────────────────────────────────────────
  const [nftTokens,  setNftTokens]  = useState<NFTToken[]>([]);
  const [nftLoading, setNftLoading] = useState(false);
  const [mintTx, setMintTx] = useState<{
    status: 'idle' | 'approving' | 'minting' | 'success' | 'error';
    error?: string;
  }>({ status: 'idle' });

  const endRef   = useRef<HTMLDivElement>(null);
  const router   = useRouter();
  const supabase = createClient();
  const { address }           = useAccount();
  const { writeContract, writeContractAsync } = useWriteContract();
  const { switchChainAsync }  = useSwitchChain();

  // ── Auth ─────────────────────────────────────────────────────
  useEffect(() => {
    getMemberSession().then(session => {
      if (!session) { router.push('/'); return; }
      setMember(session.member);
      setAuthReady(true);
    });
  }, []);

  // ── Messages ─────────────────────────────────────────────────
  const currentSalonId = privateMode ? `private-${member?.id}` : 'general';

  async function loadMessages() {
    const sid = privateMode ? `private-${member?.id}` : 'general';
    try {
      const res = await fetch(`/api/salon-message/load?salonId=${encodeURIComponent(sid)}`);
      const { messages: data, error: loadError } = await res.json();
      if (loadError) console.error('loadMessages error:', loadError);
      if (data && data.length > 0) {
        console.log('loadMessages:', data.length, 'messages, types:', [...new Set(data.map((m: any) => m.sender_type))]);
        const normalized = data.map((m: any) => ({
          ...m,
          content: (m.content || '').replace(/^\[[\w-]+\]:\s*/i, '').replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs|steve-jobs):\s*/i, ''),
          sender_type: m.sender_type || (m.message_type === 'user' ? 'member' : m.message_type === 'thinker' ? 'thinker' : 'system'),
          sender_name: m.sender_name || m.thinker_id || 'Explorer',
        }));
        setMessages(normalized);
      }
    } catch (err) {
      console.error('loadMessages fetch error:', err);
    }
  }

  useEffect(() => { loadMessages(); }, [privateMode, member?.id]);

  useEffect(() => {
    const sid = privateMode ? `private-${member?.id}` : 'general';
    const ch = supabase.channel(`salon-${sid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'salon_messages',
        filter: sid !== 'general' ? `salon_id=eq.${sid}` : undefined },
        p => {
          const msg = p.new as Message;
          if (sid === 'general' && msg.salon_id && msg.salon_id !== 'general') return;
          // Deduplicate: skip if this message ID is already in state,
          // or if it matches an optimistic/streaming message
          setMessages(prev => {
            // Skip if DB id already in state
            if (msg.id && prev.some(m => m.id === msg.id)) return prev;
            // Skip duplicate optimistic member messages
            if (msg.sender_type === 'member' && prev.some(m =>
              m.sender_type === 'member' && m.content === msg.content && m.id?.startsWith('member-')
            )) return prev;
            // Skip thinker messages that match a streamed response already in state
            if (msg.sender_type === 'thinker' && msg.thinker_id && prev.some(m =>
              m.sender_type === 'thinker' && m.thinker_id === msg.thinker_id &&
              m.content === msg.content
            )) return prev;
            // For streamed thinker messages (temp id), replace with DB version
            if (msg.sender_type === 'thinker' && msg.thinker_id) {
              const streamedIdx = prev.findIndex(m =>
                m.id?.startsWith('streaming-') && m.thinker_id === msg.thinker_id
              );
              if (streamedIdx >= 0) {
                const updated = [...prev];
                updated[streamedIdx] = { ...msg, sender_type: msg.sender_type, sender_name: msg.sender_name || msg.thinker_id };
                return updated;
              }
            }
            return [...prev, msg];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [privateMode, member?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Toast auto-dismiss ───────────────────────────────────────
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts(prev => prev.slice(1)), 3000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // ── Audio unlock init ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    initAudioUnlock();
  }, []);

  // ── First-visit onboarding detection ─────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const done = localStorage.getItem('soe_onboarding_complete');
    if (!done) setShowOnboarding(true);
  }, []);

  // ── Load wallet NFTs ──────────────────────────────────────────
  const loadNFTs = useCallback(async () => {
    if (!address || !NFT_DEPLOYED) { setNftTokens([]); return; }
    setNftLoading(true);
    setNftTokens([]);
    try {
      const total = await publicClient.readContract({
        address: SOCIETY_NFT_ADDRESS,
        abi: societyNFTABI,
        functionName: 'totalMinted',
        args: [],
      }) as bigint;

      const tokens: NFTToken[] = [];
      for (let i = 1n; i <= total; i++) {
        try {
          const owner = await publicClient.readContract({
            address: SOCIETY_NFT_ADDRESS,
            abi: societyNFTABI,
            functionName: 'ownerOf',
            args: [i],
          }) as string;
          if (owner.toLowerCase() !== address.toLowerCase()) continue;

          const res = await fetch(`https://www.societyofexplorers.com/api/nft/${i}`);
          if (!res.ok) continue;
          const meta = await res.json();
          const name: string = meta.name ?? `Society Artifact #${i}`;
          const image: string = meta.image ?? '';
          const thinker: string = meta.attributes?.find((a: { trait_type: string }) => a.trait_type === 'Thinker')?.value ?? 'Explorer';
          const accentMap: Record<string, string> = {
            Socrates: '#C9A84C', Plato: '#7B9FD4', Nietzsche: '#C0392B',
            'Marcus Aurelius': '#8E7CC3', Einstein: '#5DADE2', 'Steve Jobs': '#ABEBC6',
          };
          const color = accentMap[thinker] ?? '#c9a84c';
          tokens.push({ id: i, name, artifactType: thinker, color, image });
        } catch { /* skip */ }
      }
      setNftTokens(tokens);
    } catch (e) {
      console.error('loadNFTs error:', e);
    } finally {
      setNftLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (showArtifacts) loadNFTs();
  }, [showArtifacts, loadNFTs]);

  // ── Send chat message ─────────────────────────────────────────
  // Process TTS sentence queue — speaks sentences as they arrive
  async function processSentenceQueue(thinkerId: string) {
    if (isSpeakingRef.current) return;
    isSpeakingRef.current = true;
    while (sentenceQueueRef.current.length > 0) {
      const sentence = sentenceQueueRef.current.shift()!;
      try { await speakText(sentence, thinkerId); } catch { break; }
    }
    isSpeakingRef.current = false;
  }

  function pushSentenceFromBuffer(thinkerId: string) {
    const buf = ttsBufferRef.current;
    const match = buf.match(/^(.*?[.!?])\s(.*)$/s);
    if (match) {
      sentenceQueueRef.current.push(match[1].trim());
      ttsBufferRef.current = match[2];
      processSentenceQueue(thinkerId);
    }
  }

  function flushTtsBuffer(thinkerId: string) {
    const remaining = ttsBufferRef.current.trim();
    if (remaining) {
      sentenceQueueRef.current.push(remaining);
      ttsBufferRef.current = '';
      processSentenceQueue(thinkerId);
    }
  }

  function clearTtsQueue() {
    sentenceQueueRef.current = [];
    ttsBufferRef.current = '';
    isSpeakingRef.current = false;
    stopSpeaking();
  }

  async function handleMicPress() {
    if (isRecordingNow()) {
      setIsListening(false);
      setInterimText('transcribing...');
      // Stop live preview recognition
      try { (window as any).__soePreviewRec?.stop(); } catch {}
      try {
        const text = await stopRecording();
        setInterimText('');
        if (text.trim()) {
          setInput(text);
          if (voiceMode) setTimeout(() => send(text), 300);
        }
      } catch (err) {
        setInterimText('');
        console.error('Transcription failed:', err);
      }
    } else {
      // Interrupt any playing TTS and clear queue
      clearTtsQueue();
      try {
        await startRecording();
        setIsListening(true);
        setInterimText('listening...');
        // Start Web Speech API in parallel for live preview (best effort)
        try {
          const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (SR) {
            const rec = new SR();
            rec.continuous = true;
            rec.interimResults = true;
            rec.lang = 'en-US';
            rec.onresult = (e: any) => {
              let interim = '';
              for (let i = e.resultIndex; i < e.results.length; i++) {
                interim = e.results[i][0].transcript;
              }
              if (interim) setInterimText(interim);
            };
            rec.onerror = () => {};
            rec.onend = () => {};
            rec.start();
            // Store ref so we can stop it
            (window as any).__soePreviewRec = rec;
          }
        } catch {}
      } catch {
        alert('Microphone access denied. Please allow mic access in your browser settings.');
      }
    }
  }

  async function send(directText?: string) {
    const text = (directText ?? input).trim();
    if (!text || isLoading) return;
    setInput('');
    setIsLoading(true);

    // Optimistically add member message to state
    const memberMsg: Message = {
      id: `member-${Date.now()}`,
      created_at: new Date().toISOString(),
      salon_id: currentSalonId,
      sender_type: 'member',
      sender_name: member?.display_name || 'You',
      content: text,
    };
    setMessages(prev => [...prev, memberMsg]);

    await fetch('/api/salon-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salon_id: currentSalonId,
        sender_type: 'member',
        sender_name: member?.display_name || 'You',
        content: text,
      }),
    });

    const streamId = `streaming-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: streamId, created_at: new Date().toISOString(),
      sender_type: 'thinker', sender_name: selectedThinker.name,
      thinker_id: selectedThinker.id, content: '',
    }]);

    let responseFullText = '';
    // Reset TTS sentence queue for new response
    if (voiceMode) {
      sentenceQueueRef.current = [];
      ttsBufferRef.current = '';
    }
    try {
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thinkerId: selectedThinker.id, message: text,
          history: messages.slice(-12), isReaction: false,
          walletMemberId: member?.id,
          salonId: currentSalonId,
        }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.delta) {
              responseFullText += evt.delta;
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: m.content + evt.delta } : m));
              // Feed sentence queue for voice mode
              if (voiceMode) {
                ttsBufferRef.current += evt.delta;
                pushSentenceFromBuffer(selectedThinker.id);
              }
            } else if (evt.type === 'actions' && evt.actions?.length > 0) {
              // Show toast for each action
              const actionMessages: Record<string, string> = {
                create_task: '⬡ Task added to your Hub',
                save_note: '⬡ Insight saved',
                update_goal: '⬡ Goal updated',
                create_artifact_prompt: '⬡ Artifact queued',
                schedule_ritual: '⬡ Ritual scheduled',
              };
              for (const action of evt.actions) {
                setToasts(prev => [...prev, { id: Date.now() + Math.random(), text: actionMessages[action.type] || '⬡ Action taken' }]);
              }
            } else if (evt.done) {
              // Use clean response (actions stripped server-side)
              const cleanResponse = (evt.response || responseFullText).split('|||ACTIONS|||')[0].replace(/^\[[\w-]+\]:\s*/i, '').replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs|steve-jobs):\s*/i, '').trim();
              if (evt.response) responseFullText = cleanResponse;
              setMessages(prev => prev.map(m =>
                m.id === streamId
                  ? { ...m, content: cleanResponse || m.content }
                  : m
              ));
            }
          } catch {}
        }
      }
    } catch {}

    // Voice mode: flush remaining buffer (sentences that didn't end with .!?)
    if (voiceMode) {
      flushTtsBuffer(selectedThinker.id);
      ttsBufferRef.current = '';
    }

    if (member) {
      const { data } = await supabase.from('members')
        .select('exp_tokens,member_rank').eq('id', member.id).single();
      if (data) setMember(p => p ? { ...p, ...data } : p);
    }
    setIsLoading(false);
  }

  // ── Run ritual ────────────────────────────────────────────────
  async function runRitualExperience(ritualId: number) {
    if (!member?.id) return;
    setRitualActive(String(ritualId));
    setRitualStream('');
    setRitualArtifact(null);
    try {
      const res = await fetch('/api/ritual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ritualId, memberId: member.id }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.delta) setRitualStream(prev => prev + data.delta);
            if (data.done && data.artifact) setRitualArtifact(data.artifact);
          } catch {}
        }
      }
    } catch (err) {
      console.error('Ritual error:', err);
      setRitualStream('The ritual could not be completed. Please try again.');
    }
  }

  async function handleRunRitual(ritual: typeof RITUALS[0]) {
    if (!address) { alert('Connect your wallet first'); return; }
    await switchChainAsync({ chainId: 84532 });
    setRitualTx({ status: 'approving', ritualId: ritual.id });
    try {
      await writeContract({
        address: MOCK_SOE_ADDRESS,
        abi: erc20ABI,
        functionName: 'approve',
        args: [RITUAL_MARKETPLACE_ADDRESS, parseUnits(ritual.price.toString(), 18)],
      });
      setRitualTx({ status: 'pending', ritualId: ritual.id });
      await writeContract({
        address: RITUAL_MARKETPLACE_ADDRESS,
        abi: ritualMarketplaceABI,
        functionName: 'accessRitual',
        args: [BigInt(ritual.id)],
      });
      const systemMsg = {
        salon_id: currentSalonId,
        sender_type: 'system' as const,
        sender_name: 'system',
        content: `🪄 ${ritual.thinker} Ritual activated for ${ritual.price} $SOE`,
        created_at: new Date().toISOString(),
      };
      await fetch('/api/salon-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(systemMsg),
      });
      setMessages(prev => [...prev, { ...systemMsg, id: `ritual-${Date.now()}` }]);
      setRitualTx({ status: 'success', ritualId: ritual.id });
      runRitualExperience(ritual.id);
      loadMessages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed or rejected';
      setRitualTx({ status: 'error', error: msg, ritualId: ritual.id });
      alert(msg);
    }
  }

  // ── Mint NFT ──────────────────────────────────────────────────
  async function handleMintNFT() {
    if (!address) { alert('Connect your wallet first'); return; }
    if (!NFT_DEPLOYED) { alert('NFT contract not yet deployed'); return; }

    try {
      await switchChainAsync({ chainId: 84532 });
      setMintTx({ status: 'approving' });

      // Step 1: Approve only if allowance is insufficient
      const allowance = await publicClient.readContract({
        address: MOCK_SOE_ADDRESS,
        abi: erc20ABI,
        functionName: 'allowance',
        args: [address, SOCIETY_NFT_ADDRESS],
      }) as bigint;

      if (allowance < parseUnits(NFT_MINT_PRICE.toString(), 18)) {
        const approveTx = await writeContractAsync({
          address: MOCK_SOE_ADDRESS,
          abi: erc20ABI,
          functionName: 'approve',
          args: [SOCIETY_NFT_ADDRESS, parseUnits(NFT_MINT_PRICE.toString(), 18)],
          gas: 100_000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }

      // Step 2: Mint with higher gas ceiling
      setMintTx({ status: 'minting' });
      const mintTxHash = await writeContractAsync({
        address: SOCIETY_NFT_ADDRESS,
        abi: societyNFTABI,
        functionName: 'mint',
        args: [],
        gas: 400_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: mintTxHash });

      setMintTx({ status: 'success' });
      const systemMsg = {
        salon_id: currentSalonId,
        sender_type: 'system' as const,
        sender_name: 'system',
        content: `✦ ${member?.display_name || 'An Explorer'} minted a Society Artifact — a new relic enters the collection.`,
        created_at: new Date().toISOString(),
      };
      await fetch('/api/salon-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(systemMsg),
      });
      await loadNFTs();
    } catch (err: unknown) {
      console.error('Mint error:', err);
      const msg = err instanceof Error ? err.message : 'Mint failed';
      setMintTx({ status: 'error', error: msg });
      alert(msg);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function rank(e: number) {
    if (e >= 2000) return 'Elder';
    if (e >= 1000) return 'Master';
    if (e >= 600)  return 'Fellow';
    if (e >= 300)  return 'Scholar';
    if (e >= 100)  return 'Seeker';
    return 'Initiate';
  }

  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('soe_wallet');
    localStorage.removeItem('soe_wallet_id');
    clearWalletCookie();
    router.push('/');
  }

  function closeAllOverlays() {
    setShowMarket(false);
    setShowArtifacts(false);
    setShowThinkers(false);
    setShowHub(false);
    setShowMerch(false);
  }

  function handleOnboardingSelect(thinkerId: string) {
    setShowOnboarding(false);
    const match = THINKERS.find(t => t.id === thinkerId);
    if (match) setSelectedThinker(match);
  }

  // ── Loading guard ─────────────────────────────────────────────
  if (!authReady) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-void)' }}>
      <div style={{ fontFamily: 'Cinzel,serif', fontSize: '12px', letterSpacing: '0.3em', color: 'var(--gold-dim)' }}>
        ENTERING THE SALON...
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
    {showOnboarding && (
      <SalonOnboarding
        onSelectThinker={handleOnboardingSelect}
        memberName={member?.display_name}
      />
    )}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-void)', overflow: 'hidden' }}>

      {/* ════ TOPBAR ════ */}
      <div style={{
        height: '52px',
        background: 'linear-gradient(180deg,#0a0900,var(--bg-deep))',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', flexShrink: 0, position: 'relative', zIndex: 10,
      }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg,transparent,var(--gold-dim),var(--gold),var(--gold-dim),transparent)' }} />
        <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', letterSpacing: '0.2em', color: 'var(--gold)' }}>
          Society of Explorers
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {([
            { label: 'MINDS',     action: () => { closeAllOverlays(); setShowThinkers(v => !v); }, active: showThinkers },
            { label: 'HUB',       action: () => { closeAllOverlays(); setShowHub(v => !v); },   active: showHub },
            { label: 'MEMBERS',   action: () => router.push('/members'), active: false },
            { label: 'BOOKS',     action: () => router.push('/great-books'), active: false },
            { label: 'QUEST',     action: () => router.push('/temple-quest'), active: false },
            { label: 'LABYRINTH', action: () => router.push('/labyrinth'), active: false },
          ] as const).map(btn => (
            <button key={btn.label} onClick={btn.action} style={{
              background: btn.active ? 'var(--glow)' : 'none',
              border: `1px solid ${btn.active ? 'var(--gold)' : 'var(--border)'}`,
              color: btn.active ? 'var(--gold)' : 'var(--gold-dim)',
              fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em',
              padding: '3px 8px', cursor: 'pointer', borderRadius: '2px',
            }}>{btn.label}</button>
          ))}
          {/* ⬡ More menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMoreNav(v => !v)}
              style={{
                background: showMoreNav ? 'var(--glow)' : 'none',
                border: `1px solid ${showMoreNav ? 'var(--gold)' : 'var(--border)'}`,
                color: showMoreNav ? 'var(--gold)' : 'var(--gold-dim)',
                fontSize: '12px', fontFamily: 'Cinzel,serif',
                padding: '2px 8px', cursor: 'pointer', borderRadius: '2px',
              }}
            >⬡</button>
            {showMoreNav && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowMoreNav(false)} />
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                  background: '#0a0a0a', border: '1px solid rgba(201,168,76,0.2)',
                  zIndex: 9999, minWidth: '160px', padding: '4px 0',
                }}>
                  {([
                    { label: 'MARKET',    action: () => { closeAllOverlays(); setShowMarket(v => !v); setRitualTx({ status: 'idle' }); } },
                    { label: 'ARTIFACTS', action: () => { closeAllOverlays(); setShowArtifacts(v => !v); setMintTx({ status: 'idle' }); } },
                    { label: 'MERCH',     action: () => { closeAllOverlays(); setShowMerch(v => !v); } },
                    { label: 'TOKENS',    action: () => router.push('/tokens') },
                    { label: 'TRANSPARENCY', action: () => router.push('/transparency') },
                    { label: 'TRIBEKEY',  action: () => router.push('/tribekey') },
                    { label: 'BOOK',      action: () => router.push('/book') },
                    { label: 'HALL',      action: () => router.push('/hall') },
                    { label: 'TEMPLE',    action: () => router.push('/temple') },
                    { label: 'DATA LAYER', action: () => router.push('/data-layer') },
                    { label: 'THREE PILLARS', action: () => router.push('/three-pillars') },
                  ]).map(item => (
                    <button key={item.label} onClick={() => { item.action(); setShowMoreNav(false); }} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', borderBottom: '1px solid rgba(201,168,76,0.08)',
                      color: 'var(--gold-dim)', fontFamily: 'Cinzel,serif', fontSize: '8px',
                      letterSpacing: '0.15em', padding: '10px 16px', cursor: 'pointer',
                    }}>{item.label}</button>
                  ))}
                  <div style={{ height: '1px', background: 'rgba(201,168,76,0.15)', margin: '2px 0' }} />
                  <button onClick={() => { signOut(); setShowMoreNav(false); }} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none',
                    color: '#7a4040', fontFamily: 'Cinzel,serif', fontSize: '8px',
                    letterSpacing: '0.15em', padding: '10px 16px', cursor: 'pointer',
                  }}>LEAVE</button>
                </div>
              </>
            )}
        </div>
      </div>
      </div>

      {/* ════ THINKER DROPDOWN ════ */}
      {showThinkers && (
        <div style={{ position: 'absolute', top: '52px', left: 0, right: 0, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', zIndex: 20, padding: '8px 0' }}>
          {THINKERS.map(t => (
            <div key={t.id} onClick={() => { setSelectedThinker(t); setShowThinkers(false); }}
              style={{ padding: '12px 16px', cursor: 'pointer', borderLeft: `2px solid ${selectedThinker.id === t.id ? 'var(--gold)' : 'transparent'}`, background: selectedThinker.id === t.id ? 'var(--glow)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '16px', color: selectedThinker.id === t.id ? 'var(--gold-light)' : 'var(--ivory)' }}>{t.name}</span>
              <span style={{ fontSize: '10px', color: 'var(--ivory-muted)' }}>{t.era}</span>
            </div>
          ))}
        </div>
      )}

      {/* ════ MARKETPLACE OVERLAY ════ */}
      {showMarket && (
        <div style={{ position: 'fixed', inset: 0, top: '52px', background: 'var(--bg-void)', zIndex: 40, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-deep)', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.12em' }}>Ritual Marketplace</div>
              <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic', marginTop: '1px', fontFamily: 'Cormorant Garamond,serif' }}>Pay $SOE · Unlock wisdom · Own your access forever</div>
            </div>
            <button onClick={() => { setShowMarket(false); setRitualTx({ status: 'idle' }); }} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px' }}>CLOSE</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {RITUALS.map(ritual => {
              const isRunning = ritualTx.ritualId === ritual.id && (ritualTx.status === 'approving' || ritualTx.status === 'pending');
              const isSuccess = ritualTx.ritualId === ritual.id && ritualTx.status === 'success';
              const isError   = ritualTx.ritualId === ritual.id && ritualTx.status === 'error';
              return (
                <div key={ritual.id} style={{ background: 'var(--bg-elevated)', border: `1px solid ${isSuccess ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px', padding: '16px', transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Cinzel,serif', fontSize: '12px', color: 'var(--gold-light)', letterSpacing: '0.08em', marginBottom: '4px' }}>{ritual.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--gold-dim)', letterSpacing: '0.1em', fontFamily: 'Cinzel,serif', marginBottom: '6px' }}>with {ritual.thinker}</div>
                      <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>{ritual.tagline}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Cinzel,serif', fontSize: '14px', color: 'var(--gold)' }}>{ritual.price} $SOE</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <button onClick={() => handleRunRitual(ritual)} disabled={isRunning || isSuccess} style={{ background: isSuccess ? 'var(--glow)' : 'linear-gradient(135deg,#1c1500,#2a1e00)', border: `1px solid ${isSuccess ? 'var(--gold)' : 'var(--gold-dim)'}`, color: 'var(--gold)', fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.15em', padding: '6px 14px', cursor: isRunning || isSuccess ? 'not-allowed' : 'pointer', borderRadius: '2px', opacity: isRunning ? 0.6 : 1, transition: 'all 0.2s' }}>
                      {isSuccess ? '⬡ ACCESS GRANTED' : ritualTx.status === 'approving' && ritualTx.ritualId === ritual.id ? 'APPROVING $SOE...' : ritualTx.status === 'pending' && ritualTx.ritualId === ritual.id ? 'CONFIRMING...' : '⬡ RUN RITUAL'}
                    </button>
                  </div>
                  {isError && <div style={{ marginTop: '8px', fontSize: '11px', color: '#e07070', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic' }}>{ritualTx.error}</div>}
                </div>
              );
            })}
          </div>
          {/* Ritual Result */}
          {ritualActive && (
            <div style={{ margin: '0 16px 16px', padding: '24px', background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', flexShrink: 0, maxHeight: '50vh', overflowY: 'auto' }}>
              {ritualArtifact && (
                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.2em', color: '#c9a84c', marginBottom: '16px' }}>
                  ⬡ {ritualArtifact.title.toUpperCase()}
                </div>
              )}
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '15px', color: '#d4c9a8', lineHeight: 1.8 }}>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(ritualStream) }} />
                {!ritualArtifact && ritualStream && <span style={{ color: '#c9a84c' }}>▍</span>}
              </div>
              {ritualArtifact && (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(201,168,76,0.1)', fontFamily: 'Cinzel,serif', fontSize: '8px', letterSpacing: '0.15em', color: '#6a6050' }}>
                  SAVED TO YOUR ARTIFACTS · {ritualArtifact.thinker.toUpperCase()}
                </div>
              )}
            </div>
          )}

          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
              All payments settle on-chain. 70% to creators · 2% to the Society. You own your access record forever.
            </div>
          </div>
        </div>
      )}

      {/* ════ ARTIFACTS OVERLAY ════ */}
      {showArtifacts && (
        <div style={{ position: 'fixed', inset: 0, top: '52px', background: 'var(--bg-void)', zIndex: 40, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-deep)', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.12em' }}>Artifact Collection</div>
              <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic', marginTop: '1px', fontFamily: 'Cormorant Garamond,serif' }}>
                Mint · Own · Hold · Explore across time
              </div>
            </div>
            <button onClick={() => setShowArtifacts(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px' }}>CLOSE</button>
          </div>

          {/* Mint bar */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontFamily: 'Cinzel,serif', fontSize: '11px', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '3px' }}>
                Society of Explorers Artifact <span style={{ color: 'var(--gold-dim)', fontSize: '10px' }}>· SOEA</span>
              </div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--ivory-muted)', fontStyle: 'italic' }}>
                On-chain SVG · Unique per token · Stored on Base Sepolia forever
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '16px', color: 'var(--gold)' }}>{NFT_MINT_PRICE} $SOE</div>
                <div style={{ fontSize: '9px', color: 'var(--ivory-muted)', letterSpacing: '0.12em' }}>per artifact</div>
              </div>
              <button
                onClick={() => loadNFTs()}
                disabled={nftLoading}
                style={{
                  background: 'none', border: '1px solid var(--border)',
                  color: 'var(--gold-dim)', fontFamily: 'Cinzel,serif', fontSize: '9px',
                  letterSpacing: '0.12em', padding: '8px 12px', borderRadius: '2px',
                  cursor: nftLoading ? 'not-allowed' : 'pointer', opacity: nftLoading ? 0.4 : 0.7,
                  whiteSpace: 'nowrap',
                }}>
                {nftLoading ? '...' : '↻ REFRESH'}
              </button>
              <button
                onClick={handleMintNFT}
                disabled={mintTx.status === 'approving' || mintTx.status === 'minting' || !NFT_DEPLOYED}
                style={{
                  background: mintTx.status === 'success' ? 'var(--glow)' : 'linear-gradient(135deg,#1c1500,#2a1e00)',
                  border: `1px solid ${mintTx.status === 'success' ? 'var(--gold)' : 'var(--gold-dim)'}`,
                  color: 'var(--gold)', fontFamily: 'Cinzel,serif', fontSize: '10px',
                  letterSpacing: '0.15em', padding: '8px 18px', borderRadius: '2px',
                  cursor: mintTx.status === 'approving' || mintTx.status === 'minting' || !NFT_DEPLOYED ? 'not-allowed' : 'pointer',
                  opacity: mintTx.status === 'approving' || mintTx.status === 'minting' ? 0.6 : 1,
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}>
                {!NFT_DEPLOYED ? '⬡ COMING SOON' :
                  mintTx.status === 'approving' ? 'APPROVING $SOE...' :
                  mintTx.status === 'minting'   ? 'MINTING...' :
                  mintTx.status === 'success'   ? '✦ MINTED' :
                  '✦ MINT ARTIFACT'}
              </button>
            </div>
          </div>
          {mintTx.status === 'error' && (
            <div style={{ padding: '8px 16px', background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)', fontSize: '11px', color: '#e07070', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', flexShrink: 0 }}>
              {mintTx.error}
            </div>
          )}

          {/* Gallery */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {!NFT_DEPLOYED ? (
              <div style={{ textAlign: 'center', padding: '60px 24px', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.9 }}>
                The Artifact contract is being forged on Base Sepolia.<br />
                <span style={{ fontSize: '12px', color: 'var(--gold-dim)' }}>Run <code style={{ fontStyle: 'normal', letterSpacing: '0.05em', color: 'var(--gold)', fontSize: '11px' }}>./deploy.sh</code> to deploy and set <code style={{ fontStyle: 'normal', color: 'var(--gold)', fontSize: '11px' }}>NEXT_PUBLIC_SOCIETY_NFT_ADDRESS</code>.</span>
              </div>
            ) : nftLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 24px', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '14px', color: 'var(--text-muted)' }}>
                Reading the blockchain...
              </div>
            ) : nftTokens.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.9 }}>
                Your collection is empty.<br />
                <span style={{ fontSize: '13px', color: 'var(--gold-dim)' }}>Mint your first Society Artifact above.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                {nftTokens.map(token => (
                  <div key={token.id.toString()} style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${token.color}44`,
                    borderRadius: '4px', overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = token.color + 'aa')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = token.color + '44')}
                  >
                    {/* NFT Image (on-chain SVG) */}
                    {token.image ? (
                      <img
                        src={token.image}
                        alt={token.name}
                        style={{ width: '100%', aspectRatio: '1', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '1', background: 'var(--bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', color: token.color }}>
                        ⬡
                      </div>
                    )}
                    {/* Metadata */}
                    <div style={{ padding: '12px' }}>
                      <div style={{ fontFamily: 'Cinzel,serif', fontSize: '10px', color: token.color, letterSpacing: '0.08em', marginBottom: '4px' }}>
                        {token.artifactType.toUpperCase()} · #{token.id.toString()}
                      </div>
                      <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory)', lineHeight: 1.4 }}>
                        {token.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
              Fully on-chain art · Stored on Base Sepolia · You own this artifact forever · ERC-721 transferable
            </div>
          </div>
        </div>
      )}

      {/* ════ HUB OVERLAY ════ */}
      {showHub && member && (
        <HubOverlay member={member} onClose={() => setShowHub(false)} />
      )}

      {/* ════ MERCH OVERLAY ════ */}
      {showMerch && (
        <MerchOverlay onClose={() => setShowMerch(false)} />
      )}

      {/* ════ CHAT AREA ════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sub-header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-deep)' }}>
          <div>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.1em' }}>The Salon of Great Minds</div>
            <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic', marginTop: '1px', fontFamily: 'Cormorant Garamond,serif' }}>
              Addressing {selectedThinker.name}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '18px', color: 'var(--gold-light)' }}>{member?.exp_tokens || 0}</div>
            <div style={{ fontSize: '9px', color: 'var(--ivory-muted)', letterSpacing: '0.15em' }}>EXP · {rank(member?.exp_tokens || 0)}</div>
          </div>
        </div>

        {/* Private mode indicator */}
        {privateMode && (
          <div style={{ fontFamily: 'Cinzel,serif', fontSize: '7px', letterSpacing: '0.2em', color: '#c9a84c', opacity: 0.4, textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid rgba(201,168,76,0.1)', flexShrink: 0 }}>
            PRIVATE SESSION · ONLY YOU AND THE THINKERS
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-deep)' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Welcome to the Salon.<br />
              <span style={{ fontSize: '13px', color: 'var(--gold-dim)' }}>Tap MINDS to choose a thinker, then speak.</span><br />
              <span style={{ fontSize: '12px', color: 'var(--gold-dim)', display: 'block', marginTop: '8px' }}>Open MARKET to access rituals · ARTIFACTS to mint your relic.</span>
            </div>
          )}

          {messages.filter(msg => msg.content?.trim()).map((msg, i) => (
            <div key={msg.id || i} style={{ display: 'flex', gap: '10px', flexDirection: msg.sender_type === 'member' ? 'row-reverse' : 'row', justifyContent: msg.sender_type === 'system' ? 'center' : undefined }}>
              {msg.sender_type === 'system' ? (
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: '11px', color: 'var(--gold-dim)', padding: '4px 12px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--glow)', textAlign: 'center' }}
                  dangerouslySetInnerHTML={{ __html: msg.content }} />
              ) : (
                <>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel,serif', fontSize: '11px', fontWeight: 600, flexShrink: 0, marginTop: '2px', border: '1px solid var(--border-bright)', background: msg.sender_type === 'member' ? 'var(--sapphire)' : 'var(--bg-elevated)', color: msg.sender_type === 'member' ? '#8ab0d8' : 'var(--gold)' }}>
                    {msg.sender_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, maxWidth: '80%' }}>
                    <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.15em', color: msg.sender_type === 'member' ? 'rgba(100,150,200,0.6)' : 'var(--gold-dim)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      {msg.sender_name}
                    </div>
                    <div style={{ background: msg.sender_type === 'member' ? 'linear-gradient(135deg,#1a2030,#12182a)' : 'var(--bg-elevated)', border: `1px solid ${msg.sender_type === 'member' ? 'rgba(80,120,180,0.25)' : 'var(--border)'}`, borderRadius: msg.sender_type === 'member' ? '12px 2px 12px 12px' : '2px 12px 12px 12px', padding: '10px 14px', fontSize: '15px', lineHeight: 1.65, color: msg.sender_type === 'member' ? '#c8d8f0' : 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {msg.sender_type === 'thinker'
                        ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                        : msg.content}
                    </div>
                    {msg.sender_type === 'thinker' && msg.content && (
                      <div style={{ display: 'flex', gap: '12px', marginTop: '5px' }}>
                        <button onClick={() => { setShowMarket(true); setRitualTx({ status: 'idle' }); setShowArtifacts(false); }} style={{ background: 'none', border: 'none', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.1em', cursor: 'pointer', padding: '0', opacity: 0.7 }}>
                          ⬡ Run Ritual with {msg.sender_name}
                        </button>
                        <button
                          onClick={() => {
                            const text = msg.content?.trim();
                            console.log('LISTEN clicked', { hasContent: !!text, thinkerId: msg.thinker_id, contentLen: text?.length });
                            if (!text) { console.warn('LISTEN: no content'); return; }
                            speakText(text, msg.thinker_id || 'socrates')
                              .catch(err => console.error('LISTEN TTS error:', err));
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.1em', padding: '0', opacity: 0.5 }}
                        >
                          ⬡ LISTEN
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel,serif', fontSize: '11px', color: 'var(--gold)', flexShrink: 0 }}>
                {selectedThinker.avatar}
              </div>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '2px 12px 12px 12px', padding: '10px 14px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                {[0, 0.2, 0.4].map((d, idx) => (
                  <div key={idx} style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--gold-dim)', animation: `typing 1.2s ${d}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* ════ INPUT ════ */}
        <div style={{ paddingTop: '12px', paddingLeft: '16px', paddingRight: '16px', paddingBottom: '16px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'linear-gradient(0deg,#070600,var(--bg-deep))' }}>
          <div style={{ marginBottom: '8px' }}>
            <button
              onClick={() => setPrivateMode(!privateMode)}
              style={{
                fontFamily: 'Cinzel,serif', fontSize: '8px', letterSpacing: '0.15em',
                color: privateMode ? '#c9a84c' : '#5a5040',
                background: privateMode ? 'rgba(201,168,76,0.08)' : 'transparent',
                border: `1px solid ${privateMode ? 'rgba(201,168,76,0.3)' : 'rgba(201,168,76,0.1)'}`,
                padding: '0.4rem 0.8rem', cursor: 'pointer', transition: 'all 0.3s ease',
              }}
            >
              {privateMode ? '⬡ PRIVATE SESSION' : '⬡ GENERAL SALON'}
            </button>
            <button
              onClick={() => {
                if (!voiceMode) {
                  const isMetaMaskBrowser = /MetaMaskMobile/i.test(navigator.userAgent) || (typeof (window as any).ethereum !== 'undefined' && /Mobile/i.test(navigator.userAgent) && !/Safari/i.test(navigator.userAgent));
                  if (isMetaMaskBrowser) { alert('Voice mode works best in Safari or Chrome. MetaMask browser has limited mic support — open societyofexplorers.com in Safari for full voice.'); return; }
                  try { const s = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='); s.volume = 0; s.play().catch(() => {}); } catch {}
                } else { stopSpeaking(); }
                setVoiceMode(!voiceMode);
              }}
              style={{
                fontFamily: 'Cinzel,serif', fontSize: '8px', letterSpacing: '0.15em',
                color: voiceMode ? '#c9a84c' : '#5a5040',
                background: voiceMode ? 'rgba(201,168,76,0.08)' : 'transparent',
                border: `1px solid ${voiceMode ? 'rgba(201,168,76,0.3)' : 'rgba(201,168,76,0.1)'}`,
                padding: '0.4rem 0.8rem', cursor: 'pointer', transition: 'all 0.3s ease',
                marginLeft: '8px',
              }}
            >
              {voiceMode ? '⬡ VOICE ON' : '⬡ VOICE OFF'}
            </button>
          </div>
          {voiceMode && !isListening && !isLoading && (
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '7px', letterSpacing: '0.2em', color: '#c9a84c', opacity: 0.3, textAlign: 'center', padding: '4px' }}>
              TAP MIC OR SPEAK TO BEGIN
            </div>
          )}
          {isListening && interimText && (
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--gold-dim)', fontStyle: 'italic', padding: '0 0 6px', opacity: 0.7 }}>
              👂 {interimText}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => { setInput(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 100) + 'px'; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Speak to ${selectedThinker.name}...`}
              disabled={isLoading}
              rows={1}
              style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'EB Garamond,serif', fontSize: '16px', color: 'var(--ivory)', resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '100px', lineHeight: 1.5 }}
            />
            <button
              onClick={handleMicPress}
              style={{
                background: isListening ? 'rgba(191,64,64,0.15)' : 'none',
                border: `1px solid ${isListening ? 'rgba(191,64,64,0.5)' : 'var(--border)'}`,
                color: isListening ? '#BF4040' : 'var(--text-muted)',
                padding: '10px 14px', height: '44px', cursor: 'pointer',
                fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em',
                transition: 'all 0.3s ease', flexShrink: 0,
                animation: isListening ? 'pulse 1.5s infinite' : 'none',
              }}
            >
              {isListening ? '⬡ TAP TO SEND' : '⬡ MIC'}
            </button>
            <button onClick={() => send()} disabled={isLoading} style={{ padding: '10px 16px', height: '44px', background: 'linear-gradient(135deg,#1c1500,#2a1e00)', border: '1px solid var(--gold-dim)', borderRadius: '4px', color: 'var(--gold)', fontFamily: 'Cinzel,serif', fontSize: '11px', letterSpacing: '0.15em', cursor: isLoading ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              SPEAK
            </button>
          </div>
          {/* Artifact Generator */}
          <div style={{ padding: '0 16px 12px' }}>
            <ArtifactGenerator
              thinkerId={selectedThinker.id}
              memberName={member?.display_name || 'Explorer'}
              memberId={member?.id || ''}
              memberProject={(member as any)?.project_description}
              recentMessages={messages.slice(-10)}
            />
          </div>
        </div>
      </div>
    </div>

    {/* Action toasts */}
    {toasts.length > 0 && (
      <div style={{ position: 'fixed', bottom: '120px', right: '20px', zIndex: 200, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            padding: '10px 16px', background: 'rgba(10,10,10,0.95)',
            border: '1px solid rgba(201,168,76,0.5)', color: '#C9A84C',
            fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '2px',
          }}>
            {toast.text}
          </div>
        ))}
      </div>
    )}

    {/* Prominent Labyrinth Button */}
    <div className="fixed bottom-8 right-8 z-[9999]">
      <a
        href="/labyrinth"
        className="group flex items-center gap-x-3 bg-black border-2 border-amber-400 hover:border-amber-300 text-amber-400 hover:text-amber-200 px-8 py-5 text-xl font-light tracking-widest shadow-2xl transition-all"
        style={{ fontFamily: 'Cinzel, serif' }}
      >
        ⬡ ENTER THE LABYRINTH OF BECOMING
        <span className="text-4xl group-hover:translate-x-2 transition-transform duration-300">→</span>
      </a>
    </div>
    </>
  );
}
