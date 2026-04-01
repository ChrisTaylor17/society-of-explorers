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
  { id: 'socrates',  name: 'Socrates',        symbol: 'Σ' },
  { id: 'plato',     name: 'Plato',           symbol: 'Π' },
  { id: 'nietzsche', name: 'Nietzsche',       symbol: 'N' },
  { id: 'aurelius',  name: 'Marcus Aurelius', symbol: 'M' },
  { id: 'einstein',  name: 'Einstein',        symbol: 'E' },
  { id: 'jobs',      name: 'Steve Jobs',      symbol: 'J' },
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

  async function addTask() {
    if (!newTitle.trim() || !member?.id) return;
    await supabase.from('hub_tasks').insert({
      title: newTitle.trim(),
      status: 'todo',
      agent_id: selectedAgent,
      member_id: member.id,
    });
    setNewTitle('');
    loadTasks();
  }

  async function askAgent() {
    if (!tasks.length) return alert('Add some tasks first!');
    setAskLoading(true);
    setResponse('');
    const taskList = tasks.map(t => `- [${t.status}] ${t.title}`).join('\n');
    const res = await fetch('/api/thinker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thinkerId: selectedAgent,
        message: `Here are my current tasks:\n${taskList}\n\nWhat should I focus on and why?`,
        history: [],
        walletMemberId: member.id,
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
        try { const evt = JSON.parse(line.slice(6)); if (evt.delta) setResponse(p => p + evt.delta); } catch {}
      }
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

  const cols: { key: HubTask['status']; label: string }[] = [
    { key: 'todo',  label: 'TO DO'  },
    { key: 'doing', label: 'DOING'  },
    { key: 'done',  label: 'DONE'   },
  ];

  const selectedThinker = THINKERS.find(t => t.id === selectedAgent) ?? THINKERS[0];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{ background: bg, border: `1px solid ${goldBorder}`, width: '100%', maxWidth: '1100px', height: '88vh', borderRadius: '4px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: `0 0 60px rgba(201,168,76,0.08)` }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={{ padding: '20px 28px', borderBottom: `1px solid ${goldBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: bgCard }}>
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.6, marginBottom: '4px' }}>SOCIETY OF EXPLORERS</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', fontWeight: 300, letterSpacing: '0.2em', color: gold, margin: 0 }}>PRODUCTIVITY HUB</h2>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, margin: '2px 0 0', fontStyle: 'italic' }}>Your private workspace — guided by the minds of history</p>
          </div>
          <button
            onClick={onClose}
            style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: goldDim, background: 'none', border: `1px solid ${goldBorder}`, padding: '6px 14px', cursor: 'pointer' }}
          >
            CLOSE
          </button>
        </div>

        {/* INPUT BAR */}
        <div style={{ padding: '16px 28px', borderBottom: `1px solid ${goldBorder}`, display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0, background: bgCard }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="What needs to be done?"
            style={{ flex: 1, background: bgElevated, border: `1px solid ${goldBorder}`, borderRadius: '2px', padding: '9px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: ivory, outline: 'none' }}
          />
          <button
            onClick={addTask}
            style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', background: gold, color: '#000', border: 'none', padding: '9px 18px', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap' }}
          >
            + ADD
          </button>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            style={{ background: bgElevated, border: `1px solid ${goldBorder}`, color: gold, padding: '9px 12px', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', borderRadius: '2px', cursor: 'pointer' }}
          >
            {THINKERS.map(t => <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>)}
          </select>
          <button
            onClick={askAgent}
            disabled={askLoading}
            style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', background: askLoading ? bgElevated : `rgba(201,168,76,0.12)`, color: gold, border: `1px solid ${goldBorder}`, padding: '9px 18px', cursor: askLoading ? 'not-allowed' : 'pointer', borderRadius: '2px', opacity: askLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            {askLoading ? 'THINKING...' : `ASK ${selectedThinker.name.toUpperCase()}`}
          </button>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {/* KANBAN BOARD */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: goldBorder, overflow: 'hidden' }}>
            {cols.map(col => (
              <div key={col.key} style={{ background: bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: goldDim }}>{col.label}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: goldBorder }}>
                    {tasks.filter(t => t.status === col.key).length}
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                  {loading ? (
                    <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center', paddingTop: '20px' }}>loading...</div>
                  ) : tasks.filter(t => t.status === col.key).length === 0 ? (
                    <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center', paddingTop: '20px', opacity: 0.5 }}>empty</div>
                  ) : (
                    tasks.filter(t => t.status === col.key).map(task => {
                      const thinker = THINKERS.find(t2 => t2.id === task.agent_id);
                      return (
                        <div
                          key={task.id}
                          style={{ background: bgCard, border: `1px solid ${goldBorder}`, borderRadius: '2px', padding: '12px 14px', marginBottom: '8px' }}
                        >
                          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: ivory, lineHeight: 1.5, marginBottom: '10px' }}>{task.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: gold, opacity: 0.5 }}>{thinker?.symbol} {thinker?.name.toUpperCase()}</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {col.key !== 'todo'  && <button onClick={() => moveTask(task.id, 'todo')}  style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, background: 'none', border: `1px solid ${goldBorder}`, padding: '3px 7px', cursor: 'pointer' }}>TODO</button>}
                              {col.key !== 'doing' && <button onClick={() => moveTask(task.id, 'doing')} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted, background: 'none', border: `1px solid ${goldBorder}`, padding: '3px 7px', cursor: 'pointer' }}>DOING</button>}
                              {col.key !== 'done'  && <button onClick={() => moveTask(task.id, 'done')}  style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold, background: 'none', border: `1px solid ${goldBorder}`, padding: '3px 7px', cursor: 'pointer' }}>DONE</button>}
                              <button onClick={() => deleteTask(task.id)} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: '#7a3030', background: 'none', border: `1px solid rgba(120,48,48,0.3)`, padding: '3px 7px', cursor: 'pointer' }}>✕</button>
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
          {response && (
            <div style={{ width: '320px', borderLeft: `1px solid ${goldBorder}`, background: bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${goldBorder}`, flexShrink: 0 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.6 }}>
                  {selectedThinker.symbol} {selectedThinker.name.toUpperCase()} SPEAKS
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px', fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: ivory, lineHeight: 1.8 }}>
                {response}
                {askLoading && <span style={{ color: gold }}>▍</span>}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ padding: '10px 28px', borderTop: `1px solid ${goldBorder}`, display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0, background: bgCard }}>
          {THINKERS.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedAgent(t.id)}
              style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: selectedAgent === t.id ? gold : muted, background: 'none', border: 'none', cursor: 'pointer', opacity: selectedAgent === t.id ? 1 : 0.5, padding: '4px 0' }}
            >
              {t.symbol} {t.name.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
