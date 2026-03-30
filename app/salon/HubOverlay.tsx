'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface HubTask {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  agent_id: string;
}

interface Member {
  id: string;
  display_name: string;
}

const THINKERS = [
  { id: 'socrates',  name: 'Socrates',        symbol: 'Σ' },
  { id: 'plato',     name: 'Plato',           symbol: 'Π' },
  { id: 'nietzsche', name: 'Nietzsche',       symbol: 'N' },
  { id: 'aurelius',  name: 'Marcus Aurelius', symbol: 'M' },
  { id: 'einstein',  name: 'Einstein',        symbol: 'E' },
  { id: 'jobs',      name: 'Steve Jobs',      symbol: 'J' },
];

export default function HubOverlay({ member, onClose }: { member: Member; onClose: () => void }) {
  const supabase = createClient();
  const [tasks,         setTasks]         = useState<HubTask[]>([]);
  const [newTitle,      setNewTitle]      = useState('');
  const [selectedAgent, setSelectedAgent] = useState('socrates');
  const [loading,       setLoading]       = useState(true);
  const [askLoading,    setAskLoading]    = useState(false);
  const [response,      setResponse]      = useState('');

  const loadTasks = useCallback(async () => {
    if (!member?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hub_tasks')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTasks((data ?? []) as HubTask[]);
      console.log('✅ Tasks loaded:', data?.length ?? 0);
    } catch (err) {
      console.error('loadTasks error:', err);
      alert('Could not load tasks — check console');
    } finally {
      setLoading(false);
    }
  }, [member?.id]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const addTask = async () => {
    if (!newTitle.trim() || !member?.id) {
      console.warn('addTask: missing title or member id', { title: newTitle, id: member?.id });
      return;
    }
    try {
      const { error } = await supabase.from('hub_tasks').insert({
        member_id: member.id,
        title: newTitle.trim(),
        status: 'todo',
        agent_id: selectedAgent,
      });
      if (error) throw error;
      setNewTitle('');
      await loadTasks();
      console.log('✅ Task added');
    } catch (err) {
      console.error('addTask error:', err);
      alert('Failed to add task — check console for details');
    }
  };

  const askAgent = async () => {
    if (!tasks.length) { alert('Add some tasks first!'); return; }
    setAskLoading(true);
    setResponse('');
    try {
      const taskList = tasks.map(t => `${t.status.toUpperCase()}: ${t.title}`).join('\n');
      const thinkerName = THINKERS.find(t => t.id === selectedAgent)?.name ?? selectedAgent;
      const fakeStream = `Thinking as ${thinkerName.toUpperCase()}...\n\nBased on your current tasks:\n${taskList}\n\nFocus on whatever is in DOING first — finish what you started. Then attack the most important TODO. What would you like to break down further?`;
      for (let i = 0; i < fakeStream.length; i++) {
        setResponse(prev => prev + fakeStream[i]);
        await new Promise(r => setTimeout(r, 18));
      }
      console.log('✅ ASK response sent');
    } catch (err) {
      console.error('askAgent error:', err);
      alert('ASK failed — check console');
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-[#111008] border border-[#c9a84c]/30 w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-8 py-4 border-b border-[#c9a84c]/20 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-serif text-[#f0d080] tracking-widest">PRODUCTIVITY HUB</h2>
            <p className="text-xs text-[#c9a84c]/60 tracking-widest mt-1">Your private workspace · guided by the minds of history</p>
          </div>
          <button onClick={onClose} className="text-[#c9a84c]/60 hover:text-[#f0d080] text-sm tracking-widest transition-colors">CLOSE</button>
        </div>

        {/* Controls */}
        <div className="px-8 py-4 flex gap-3 items-center border-b border-[#c9a84c]/20">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="What needs to be done?"
            className="flex-1 bg-[#1e1a12] border border-[#c9a84c]/30 rounded px-4 py-3 text-white placeholder:text-[#c9a84c]/40 focus:outline-none focus:border-[#c9a84c]/60"
          />
          <button
            onClick={addTask}
            className="bg-[#c9a84c] hover:bg-[#f0d080] text-black px-6 py-3 rounded font-medium text-sm tracking-wider transition-colors"
          >
            + ADD
          </button>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            className="bg-[#1e1a12] border border-[#c9a84c]/30 text-[#c9a84c] px-4 py-3 rounded focus:outline-none"
          >
            {THINKERS.map(t => (
              <option key={t.id} value={t.id}>{t.symbol} {t.name}</option>
            ))}
          </select>
          <button
            onClick={askAgent}
            disabled={askLoading}
            className="bg-[#c9a84c]/20 hover:bg-[#c9a84c]/30 border border-[#c9a84c]/40 text-[#c9a84c] px-8 py-3 rounded text-sm tracking-wider transition-colors disabled:opacity-40"
          >
            {askLoading ? 'THINKING...' : `ASK ${(THINKERS.find(t => t.id === selectedAgent)?.name ?? selectedAgent).toUpperCase().split(' ')[0]}`}
          </button>
        </div>

        {/* Agent response */}
        {response && (
          <div className="mx-8 mt-4 p-5 bg-[#1e1a12] border border-[#c9a84c]/20 rounded text-[#c9a84c]/80 text-sm leading-relaxed max-h-36 overflow-auto whitespace-pre-wrap">
            {response}
          </div>
        )}

        {/* Kanban */}
        <div className="flex-1 p-8 grid grid-cols-3 gap-6 overflow-auto">
          {loading ? (
            <div className="col-span-3 text-center text-[#c9a84c]/40 italic pt-12">Reading tasks...</div>
          ) : (
            (['todo', 'doing', 'done'] as const).map(status => {
              const col = tasks.filter(t => t.status === status);
              return (
                <div key={status} className="flex flex-col">
                  <div className="uppercase text-xs tracking-widest text-[#c9a84c]/50 mb-3 flex justify-between">
                    <span>{status === 'todo' ? 'TO DO' : status === 'doing' ? 'DOING' : 'DONE'}</span>
                    <span className="opacity-50">{col.length}</span>
                  </div>
                  <div className="flex-1 bg-[#1e1a12]/50 rounded p-4 space-y-3 min-h-24">
                    {col.length === 0 && (
                      <div className="text-[#c9a84c]/25 italic text-xs">empty</div>
                    )}
                    {col.map(task => (
                      <div key={task.id} className="bg-[#111008] border border-[#c9a84c]/15 p-4 rounded text-sm text-[#f0e8d5] hover:border-[#c9a84c]/35 transition-colors">
                        {task.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-3 border-t border-[#c9a84c]/15 flex justify-between text-[9px] tracking-widest text-[#c9a84c]/30 uppercase">
          <span>{tasks.filter(t => t.status === 'done').length} / {tasks.length} complete</span>
          <span>Private · Supabase · Society of Explorers</span>
        </div>
      </div>
    </div>
  );
}
