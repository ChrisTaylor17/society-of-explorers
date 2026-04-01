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
    setLoading(true);
    const { data, error } = await supabase
      .from('hub_tasks')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setTasks(data || []);
    setLoading(false);
  }, [member?.id]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const addTask = async () => {
    if (!newTitle.trim() || !member?.id) return;
    const { error } = await supabase.from('hub_tasks').insert({
      member_id: member.id,
      title: newTitle.trim(),
      status: 'todo',
      agent_id: selectedAgent,
    });
    if (error) alert('Add failed — check console');
    else {
      setNewTitle('');
      loadTasks();
    }
  };

  const askAgent = async () => {
    if (!tasks.length) return alert('Add some tasks first!');
    setAskLoading(true);
    setResponse('');
    try {
      const taskList = tasks.map(t => `${t.status.toUpperCase()}: ${t.title}`).join('\n');
      const thinker = THINKERS.find(t => t.id === selectedAgent) || THINKERS[0];
      const fakeStream = `Thinking as ${thinker.name}...\n\nYour current tasks:\n${taskList}\n\nFocus on finishing whatever is in DOING first. Then tackle the top TODO. Want me to break one down into subtasks?`;
      for (const char of fakeStream) {
        setResponse(prev => prev + char);
        await new Promise(r => setTimeout(r, 15));
      }
    } catch (err) {
      console.error(err);
      alert('ASK failed');
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#111827",border:"1px solid rgba(201,168,76,0.3)",width:"100%",maxWidth:"1100px",height:"88vh",borderRadius:"16px",overflow:"hidden",display:"flex",flexDirection:"column"}} onClick={(e)=>e.stopPropagation()}>

        {/* Header */}
        <div className="px-8 py-4 border-b border-[#c9a84c]/20 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-serif text-[#f0d080]">PRODUCTIVITY HUB</h2>
            <p className="text-xs text-[#c9a84c]/70 tracking-widest">Your private workspace · guided by the minds of history</p>
          </div>
          <button onClick={onClose} className="text-[#c9a84c]/70 hover:text-[#f0d080]">CLOSE</button>
        </div>

        {/* Controls */}
        <div className="px-8 py-4 flex gap-3 border-b border-[#c9a84c]/20">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="What needs to be done?"
            className="flex-1 bg-[#1f2937] border border-[#c9a84c]/30 rounded px-4 py-3 text-white placeholder:text-[#c9a84c]/50 focus:outline-none"
          />
          <button onClick={addTask} className="bg-[#c9a84c] hover:bg-[#f0d080] text-black px-6 py-3 rounded font-medium">+ ADD</button>
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} className="bg-[#1f2937] border border-[#c9a84c]/30 text-white px-4 py-3 rounded">
            {THINKERS.map(t => <option key={t.id} value={t.id}>{t.symbol} {t.name}</option>)}
          </select>
          <button onClick={askAgent} disabled={askLoading} className="bg-[#c9a84c]/90 hover:bg-[#f0d080] text-black px-8 py-3 rounded font-medium disabled:opacity-40">
            {askLoading ? 'THINKING...' : `ASK ${selectedAgent.toUpperCase()}`}
          </button>
        </div>

        {/* Response area */}
        {response && (
          <div className="mx-8 mt-4 p-6 bg-[#1f2937] border border-[#c9a84c]/20 rounded text-[#c9a84c]/90 text-sm leading-relaxed max-h-40 overflow-auto whitespace-pre-wrap flex-shrink-0">
            {response}
          </div>
        )}

        {/* Kanban */}
        <div className="flex-1 p-8 grid grid-cols-3 gap-6 overflow-auto">
          {(['todo', 'doing', 'done'] as const).map(status => (
            <div key={status} className="flex flex-col">
              <div className="uppercase text-xs tracking-widest text-[#c9a84c]/60 mb-3">
                {status === 'todo' ? 'TO DO' : status === 'doing' ? 'DOING' : 'DONE'} · {tasks.filter(t => t.status === status).length}
              </div>
              <div className="flex-1 bg-[#1f2937]/50 rounded p-4 space-y-3">
                {tasks.filter(t => t.status === status).map(task => (
                  <div key={task.id} className="bg-[#111827] p-4 rounded text-sm text-[#f0e8d5]">
                    {task.title}
                  </div>
                ))}
                {tasks.filter(t => t.status === status).length === 0 && (
                  <div className="text-[#c9a84c]/30 italic text-xs">empty</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
