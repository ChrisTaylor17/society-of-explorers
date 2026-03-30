'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface HubTask {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  agent_id: string;
  created_at: string;
}

interface Member {
  id: string;
  display_name: string;
}

const AGENTS = [
  { id: 'socrates',  name: 'Socrates',       symbol: 'Σ', accent: '#C9A84C' },
  { id: 'plato',     name: 'Plato',          symbol: 'Π', accent: '#7B9FD4' },
  { id: 'nietzsche', name: 'Nietzsche',      symbol: 'N', accent: '#C0392B' },
  { id: 'aurelius',  name: 'Marcus Aurelius',symbol: 'M', accent: '#8E7CC3' },
  { id: 'einstein',  name: 'Einstein',       symbol: 'E', accent: '#5DADE2' },
  { id: 'jobs',      name: 'Steve Jobs',     symbol: 'J', accent: '#ABEBC6' },
];

const COLUMNS: { key: 'todo' | 'doing' | 'done'; label: string }[] = [
  { key: 'todo',  label: 'TO DO'  },
  { key: 'doing', label: 'DOING'  },
  { key: 'done',  label: 'DONE'   },
];

const NEXT_STATUS: Record<string, 'todo' | 'doing' | 'done'> = {
  todo: 'doing', doing: 'done', done: 'todo',
};

export default function HubOverlay({ member, onClose }: { member: Member; onClose: () => void }) {
  const supabase = createClient();
  const [tasks,         setTasks]         = useState<HubTask[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [newTitle,      setNewTitle]      = useState('');
  const [selectedAgent, setSelectedAgent] = useState('socrates');
  const [agentReply,    setAgentReply]    = useState('');
  const [agentLoading,  setAgentLoading]  = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hub_tasks')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: true });
    setTasks((data as HubTask[]) ?? []);
    setLoading(false);
  }, [member.id]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    const { data } = await supabase
      .from('hub_tasks')
      .insert({ member_id: member.id, title, status: 'todo', agent_id: selectedAgent })
      .select()
      .single();
    if (data) setTasks(prev => [...prev, data as HubTask]);
  }

  async function moveTask(id: string, currentStatus: string) {
    const next = NEXT_STATUS[currentStatus];
    await supabase
      .from('hub_tasks')
      .update({ status: next, ...(next === 'done' ? { completed_at: new Date().toISOString() } : { completed_at: null }) })
      .eq('id', id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: next } : t));
  }

  async function deleteTask(id: string) {
    await supabase.from('hub_tasks').delete().eq('id', id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function askAgent() {
    setAgentReply('');
    setAgentLoading(true);
    const todo  = tasks.filter(t => t.status === 'todo').map(t => t.title);
    const doing = tasks.filter(t => t.status === 'doing').map(t => t.title);
    const done  = tasks.filter(t => t.status === 'done').map(t => t.title);
    const message = [
      'Here are my current tasks:',
      todo.length  ? `TODO: ${todo.join(' / ')}`   : null,
      doing.length ? `DOING: ${doing.join(' / ')}`  : null,
      done.length  ? `DONE: ${done.join(' / ')}`    : null,
      '',
      'What should I focus on next? What am I missing? What would you cut or accelerate?',
    ].filter(Boolean).join('\n');

    try {
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thinkerId: selectedAgent,
          message,
          history: [],
          isReaction: false,
          walletMemberId: member.id,
        }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setAgentReply(text);
      }
    } catch {
      setAgentReply('Agent unavailable.');
    } finally {
      setAgentLoading(false);
    }
  }

  const agent = AGENTS.find(a => a.id === selectedAgent) ?? AGENTS[0];

  return (
    <div style={{ position: 'absolute', inset: 0, top: '52px', background: 'var(--bg-void)', zIndex: 30, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-deep)', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.12em' }}>Productivity Hub</div>
          <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic', marginTop: '1px', fontFamily: 'Cormorant Garamond,serif' }}>
            Your private workspace · guided by the minds of history
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px' }}>CLOSE</button>
      </div>

      {/* ── Add task + agent bar ── */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0, display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Add a task..."
          style={{ flex: 1, background: 'var(--bg-void)', border: '1px solid var(--border)', color: 'var(--ivory)', fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', padding: '6px 10px', borderRadius: '2px', outline: 'none' }}
        />
        <button onClick={addTask} style={{ background: 'linear-gradient(135deg,#1c1500,#2a1e00)', border: '1px solid var(--gold-dim)', color: 'var(--gold)', fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.12em', padding: '7px 14px', borderRadius: '2px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + ADD
        </button>
        <select
          value={selectedAgent}
          onChange={e => setSelectedAgent(e.target.value)}
          style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--gold-dim)', fontFamily: 'Cinzel,serif', fontSize: '10px', padding: '6px 8px', borderRadius: '2px', cursor: 'pointer' }}
        >
          {AGENTS.map(a => <option key={a.id} value={a.id}>{a.symbol} {a.name}</option>)}
        </select>
        <button
          onClick={askAgent}
          disabled={agentLoading || tasks.length === 0}
          style={{ background: 'none', border: `1px solid ${agent.accent}44`, color: agent.accent, fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.1em', padding: '7px 14px', borderRadius: '2px', cursor: agentLoading || tasks.length === 0 ? 'not-allowed' : 'pointer', opacity: agentLoading ? 0.5 : 1, whiteSpace: 'nowrap', transition: 'all 0.2s' }}
        >
          {agentLoading ? '...' : `ASK ${agent.name.toUpperCase().split(' ')[0]}`}
        </button>
      </div>

      {/* ── Agent reply ── */}
      {agentReply && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#0a0900', flexShrink: 0, maxHeight: '130px', overflowY: 'auto' }}>
          <div style={{ color: agent.accent, fontStyle: 'normal', fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '6px' }}>
            {agent.symbol} {agent.name.toUpperCase()}
          </div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory-muted)', fontStyle: 'italic', lineHeight: 1.75 }}>
            {agentReply}
          </div>
        </div>
      )}

      {/* ── Kanban board ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignContent: 'start' }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Reading tasks...
          </div>
        ) : (
          COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            return (
              <div key={col.key}>
                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: 'var(--gold-dim)', letterSpacing: '0.15em', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  {col.label}
                  <span style={{ opacity: 0.4 }}>{colTasks.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {colTasks.length === 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', opacity: 0.35, padding: '4px 0' }}>
                      empty
                    </div>
                  )}
                  {colTasks.map(task => {
                    const taskAgent = AGENTS.find(a => a.id === task.agent_id) ?? AGENTS[0];
                    return (
                      <div
                        key={task.id}
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '3px', padding: '10px', transition: 'border-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-dim)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                      >
                        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: col.key === 'done' ? 'var(--text-muted)' : 'var(--ivory)', lineHeight: 1.4, marginBottom: '8px', textDecoration: col.key === 'done' ? 'line-through' : 'none', opacity: col.key === 'done' ? 0.6 : 1 }}>
                          {task.title}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: taskAgent.accent, opacity: 0.6, fontFamily: 'Cinzel,serif' }}>
                            {taskAgent.symbol}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => moveTask(task.id, task.status)}
                              title={col.key === 'done' ? 'Reset to Todo' : 'Move forward'}
                              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--gold-dim)', fontSize: '11px', padding: '2px 8px', borderRadius: '2px', cursor: 'pointer' }}
                            >
                              {col.key === 'done' ? '↺' : '→'}
                            </button>
                            <button
                              onClick={() => deleteTask(task.id)}
                              title="Delete"
                              style={{ background: 'none', border: '1px solid var(--border)', color: '#555', fontSize: '11px', padding: '2px 8px', borderRadius: '2px', cursor: 'pointer' }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', opacity: 0.5 }}>
          {tasks.filter(t => t.status === 'done').length} / {tasks.length} complete
        </span>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', opacity: 0.4 }}>
          PRIVATE · ENCRYPTED · BASE SEPOLIA
        </span>
      </div>
    </div>
  );
}
