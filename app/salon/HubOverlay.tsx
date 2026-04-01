'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface HubTask {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  agent_id: string;
}

const THINKERS = [
  { id: 'socrates',       name: 'Socrates',        symbol: 'Σ', voice: 'Question everything. What is the unexamined assumption blocking your most urgent task?' },
  { id: 'plato',          name: 'Plato',           symbol: 'Π', voice: 'Seek the ideal form. Which task, if done perfectly, brings all others into alignment?' },
  { id: 'nietzsche',      name: 'Nietzsche',       symbol: 'N', voice: 'Stop hedging. The will to power demands one act of creation today — which is it?' },
  { id: 'aurelius',       name: 'Marcus Aurelius', symbol: 'M', voice: 'Do what the moment demands. Not what is comfortable — what is necessary.' },
  { id: 'einstein',       name: 'Einstein',        symbol: 'E', voice: 'Simplify until only the essential remains. What is the single principle that resolves all of this?' },
  { id: 'jobs',           name: 'Steve Jobs',      symbol: 'J', voice: 'Real artists ship. Which task, executed with insane focus today, changes everything?' },
];

const gold = '#c9a84c';
const goldDim = 'rgba(201,168,76,0.6)';
const goldBorder = 'rgba(201,168,76,0.2)';
const bg = '#0a0a0a';
const bgCard = '#0f0f0f';
const bgElevated = '#141410';
const ivory = '#e8e0d0';
const muted = '#7a7060';

export default function HubOverlay({ member, onClose }: { member: any; onClose: () => void }) {
  const supabase = createClient();
  const [tasks,         setTasks]         = useState<HubTask[]>([]);
  const [newTitle,      setNewTitle]      = useState('');
  const [selectedAgent, setSelectedAgent] = useState('socrates');
  const [loading,       setLoading]       = useState(true);
  const [askLoading,    setAskLoading]    = useState(false);
  const [response,      setResponse]      = useState('');
  const [responseAgent, setResponseAgent] = useState('socrates');

  const loadTasks = useCallback(async () => {
    if (!member?.id) return;
    const { data } = await supabase
      .from('hub_tasks')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: true });
    setTasks(data ?? []);
    setLoading(false);
  }, [member?.id, supabase]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function addTask(title?: string) {
    const t = (title ?? newTitle).trim();
    if (!t || !member?.id) return;
    const { error } = await supabase.from('hub_tasks').insert({
      title: t,
      status: 'todo',
      agent_id: selectedAgent,
      member_id: member.id,
    });
    if (error) console.error('addTask error:', error);
    setNewTitle('');
    loadTasks();
  }

  async function askAgent() {
    if (!tasks.length) {
      setResponse('Add some tasks first — I cannot counsel you on an empty mind.');
      setResponseAgent(selectedAgent);
      return;
    }
    setAskLoading(true);
    setResponse('');
    setResponseAgent(selectedAgent);
    const thinker = THINKERS.find(t => t.id === selectedAgent) ?? THINKERS[0];
    const taskList = tasks.map(t => `[${t.status.toUpperCase()}] ${t.title}`).join('\n');

    try {
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thinkerId: selectedAgent,
          message: `Here are my current tasks:\n${taskList}\n\nSpeak to me as ${thinker.name}. Be direct, provocative, and in character. Tell me exactly what to focus on and why. Be specific about which task matters most right now. Keep it under 150 words.`,
          history: [],
          walletMemberId: member.id,
        }),
      });

      if (!res.ok) {
        setResponse(`${thinker.name} is unavailable right now. Check the API connection.`);
        setAskLoading(false);
        return;
      }

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
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.delta) setResponse(p => p + evt.delta);
            if (evt.text)  setResponse(p => p + evt.text);
          } catch {}
        }
      }
    } catch (err) {
      setResponse('Something went wrong. Try again.');
    }
    setAskLoading(false);
  }

  async function moveTask(id: string, status: HubTask['status']) {
    await supabase.from('hub_tasks').update({ status }).eq('id', id);
    loadTasks();
  }

  async function deleteTask(id: string) {
    await supabase.from('hub_tasks').delete().eq('id', id);
    loadTasks();
  }

  const cols: { key: HubTask['status']; label: string; accent: string }[] = [
    { key: 'todo',  label: 'TO DO',  accent: goldBorder },
    { key: 'doing', label: 'DOING',  accent: 'rgba(201,168,76,0.4)' },
    { key: 'done',  label: 'DONE',   accent: 'rgba(80,160,80,0.3)' },
  ];

  const selectedThinker = THINKERS.find(t => t.id === selectedAgent) ?? THINKERS[0];
  const responseThinker = THINKERS.find(t => t.id === responseAgent) ?? THINKERS[0];

  return (
    <>
        {/* HEADER */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${goldBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: bgCard }}>
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '3px' }}>SOCIETY OF EXPLORERS</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', fontWeight: 300, letterSpacing: '0.2em', color: gold, margin: 0 }}>PRODUCTIVITY HUB</h2>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, margin: '2px 0 0', fontStyle: 'italic' }}>Your private workspace — guided by the minds of history</p>
          </div>
          <button onClick={onClose} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: goldDim, background: 'none', border: `1px solid ${goldBorder}`, padding: '6px 14px', cursor: 'pointer' }}>
            CLOSE
          </button>
        </div>

        {/* INPUT BAR */}
        <div style={{ padding: '12px 24px', borderBottom: `1px solid ${goldBorder}`, display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, background: bgCard }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="What needs to be done?"
            style={{ flex: 1, background: bgElevated, border: `1px solid ${goldBorder}`, borderRadius: '2px', padding: '8px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, outline: 'none' }}
          />
          <button onClick={() => addTask()} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', background: gold, color: '#000', border: 'none', padding: '8px 16px', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap' }}>
            + ADD
          </button>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            style={{ background: bgElevated, border: `1px solid ${goldBorder}`, color: gold, padding: '8px 12px', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', borderRadius: '2px', cursor: 'pointer' }}
          >
            {THINKERS.map(t => <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>)}
          </select>
          <button
            onClick={askAgent}
            disabled={askLoading}
            style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', background: askLoading ? bgElevated : `rgba(201,168,76,0.1)`, color: gold, border: `1px solid ${goldBorder}`, padding: '8px 18px', cursor: askLoading ? 'not-allowed' : 'pointer', borderRadius: '2px', opacity: askLoading ? 0.5 : 1, whiteSpace: 'nowrap', minWidth: '140px' }}
          >
            {askLoading ? `${selectedThinker.symbol} THINKING...` : `${selectedThinker.symbol} ASK ${selectedThinker.name.split(' ')[0].toUpperCase()}`}
          </button>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

          {/* KANBAN BOARD */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: goldBorder, overflow: 'hidden' }}>
            {cols.map(col => (
              <div key={col.key} style={{ background: bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: `1px solid ${col.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: col.key === 'done' ? 'rgba(80,160,80,0.7)' : goldDim }}>{col.label}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: muted }}>{tasks.filter(t => t.status === col.key).length}</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                  {loading ? (
                    <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center', paddingTop: '20px' }}>loading...</div>
                  ) : tasks.filter(t => t.status === col.key).length === 0 ? (
                    <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, fontStyle: 'italic', textAlign: 'center', paddingTop: '20px', opacity: 0.4 }}>empty</div>
                  ) : (
                    tasks.filter(t => t.status === col.key).map(task => {
                      const thinker = THINKERS.find(t2 => t2.id === task.agent_id);
                      return (
                        <div key={task.id} style={{ background: bgCard, border: `1px solid ${goldBorder}`, borderRadius: '2px', padding: '10px 12px', marginBottom: '6px' }}>
                          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: ivory, lineHeight: 1.5, marginBottom: '8px' }}>{task.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold, opacity: 0.4 }}>{thinker?.symbol}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {col.key !== 'todo'  && <button onClick={() => moveTask(task.id, 'todo')}  style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.1em', color: muted, background: 'none', border: `1px solid ${goldBorder}`, padding: '2px 6px', cursor: 'pointer' }}>TODO</button>}
                              {col.key !== 'doing' && <button onClick={() => moveTask(task.id, 'doing')} style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.1em', color: muted, background: 'none', border: `1px solid ${goldBorder}`, padding: '2px 6px', cursor: 'pointer' }}>DOING</button>}
                              {col.key !== 'done'  && <button onClick={() => moveTask(task.id, 'done')}  style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.1em', color: 'rgba(80,160,80,0.7)', background: 'none', border: `1px solid rgba(80,160,80,0.2)`, padding: '2px 6px', cursor: 'pointer' }}>✓ DONE</button>}
                              <button onClick={() => deleteTask(task.id)} style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', color: '#7a3030', background: 'none', border: `1px solid rgba(120,48,48,0.3)`, padding: '2px 6px', cursor: 'pointer' }}>✕</button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* THINKER RESPONSE PANEL */}
          <div style={{ width: '340px', borderLeft: `1px solid ${goldBorder}`, background: bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            {/* Thinker selector */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${goldBorder}`, flexShrink: 0 }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginBottom: '8px' }}>CONSULT A MIND</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {THINKERS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedAgent(t.id)}
                    style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: selectedAgent === t.id ? '#000' : goldDim, background: selectedAgent === t.id ? gold : 'none', border: `1px solid ${selectedAgent === t.id ? gold : goldBorder}`, padding: '4px 10px', cursor: 'pointer', borderRadius: '2px', transition: 'all 0.2s' }}
                  >
                    {t.symbol} {t.name.split(' ')[0].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Response area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {!response && !askLoading ? (
                <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>{selectedThinker.symbol}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, fontStyle: 'italic', lineHeight: 1.7, opacity: 0.7 }}>
                    {selectedThinker.voice}
                  </div>
                  <button
                    onClick={askAgent}
                    style={{ marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, background: 'none', border: `1px solid ${goldBorder}`, padding: '8px 20px', cursor: 'pointer' }}
                  >
                    ASK {selectedThinker.name.split(' ')[0].toUpperCase()}
                  </button>
                </div>
              ) : askLoading ? (
                <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.4, marginBottom: '1rem' }}>{selectedThinker.symbol}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, fontStyle: 'italic' }}>
                    {selectedThinker.name} is considering your tasks...
                  </div>
                  <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '6px' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: '4px', height: '4px', borderRadius: '50%', background: gold, opacity: 0.4, animation: `pulse 1.2s ${i * 0.3}s ease-in-out infinite` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: `1px solid ${goldBorder}` }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: gold, opacity: 0.6 }}>{responseThinker.symbol}</div>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.7 }}>{responseThinker.name.toUpperCase()}</div>
                      <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '10px', color: muted, fontStyle: 'italic' }}>speaks</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: ivory, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                    {response}
                    {askLoading && <span style={{ color: gold }}>▍</span>}
                  </div>
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${goldBorder}` }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, marginBottom: '8px' }}>ASK ANOTHER MIND</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {THINKERS.filter(t => t.id !== responseAgent).map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedAgent(t.id); setTimeout(askAgent, 50); }}
                          style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: goldDim, background: 'none', border: `1px solid ${goldBorder}`, padding: '3px 8px', cursor: 'pointer' }}
                        >
                          {t.symbol} {t.name.split(' ')[0].toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ padding: '8px 24px', borderTop: `1px solid ${goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: bgCard }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, opacity: 0.6 }}>
            {tasks.length} TASKS · {tasks.filter(t => t.status === 'done').length} COMPLETED
          </div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '11px', color: muted, fontStyle: 'italic', opacity: 0.5 }}>
            guided by the minds of history
          </div>
        </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }
      `}</style>
    </>
  );
}
