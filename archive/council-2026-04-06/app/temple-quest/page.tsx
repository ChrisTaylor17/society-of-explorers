'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

// ── CONSTANTS ──────────────────────────────────────────────
const GOLD = '#C5A55A';
const DIM = '#9a8f7a';
const BG = '#0A0A0A';
const WALL = '#C5A55A';
const PLAYER_SIZE = 10;
const MOVE_SPEED = 3;
const NPC_RADIUS = 14;
const ARTIFACT_SIZE = 6;
const INTERACT_DIST = 45;

// ── ROOM DEFINITIONS ───────────────────────────────────────
interface Room {
  id: string; name: string; x: number; y: number; w: number; h: number;
  doors: { side: 'n' | 's' | 'e' | 'w'; pos: number }[];
  npc?: { x: number; y: number; symbol: string; color: string; thinkerId: string };
  artifacts: { x: number; y: number }[];
}

// Layout: rooms share walls so doors align perfectly
// Row 1: Entrance (centered)
// Row 2: Socrates | Plato (share wall, entrance door connects to both via corridor)
// Row 3: Nietzsche | Aurelius | Einstein (share walls)
// Row 4: Sanctum (below Einstein)
const ROOMS: Room[] = [
  { id: 'entrance', name: 'ENTRANCE HALL', x: 200, y: 0, w: 200, h: 150,
    doors: [{ side: 's', pos: 50 }, { side: 's', pos: 150 }],
    artifacts: [{ x: 50, y: 50 }, { x: 150, y: 100 }] },
  { id: 'socrates', name: 'HALL OF SOCRATES', x: 100, y: 150, w: 200, h: 150,
    doors: [{ side: 'n', pos: 150 }, { side: 'e', pos: 75 }, { side: 's', pos: 100 }],
    npc: { x: 100, y: 80, symbol: 'Σ', color: '#C9A94E', thinkerId: 'socrates' },
    artifacts: [{ x: 40, y: 40 }, { x: 160, y: 120 }, { x: 30, y: 110 }] },
  { id: 'plato', name: 'HALL OF PLATO', x: 300, y: 150, w: 200, h: 150,
    doors: [{ side: 'n', pos: 50 }, { side: 'w', pos: 75 }, { side: 's', pos: 100 }],
    npc: { x: 100, y: 80, symbol: 'Π', color: '#7B68EE', thinkerId: 'plato' },
    artifacts: [{ x: 50, y: 30 }, { x: 150, y: 110 }] },
  { id: 'nietzsche', name: 'HALL OF NIETZSCHE', x: 0, y: 300, w: 200, h: 150,
    doors: [{ side: 'n', pos: 100 }, { side: 'e', pos: 75 }],
    npc: { x: 100, y: 80, symbol: 'N', color: '#DC143C', thinkerId: 'nietzsche' },
    artifacts: [{ x: 40, y: 30 }, { x: 160, y: 120 }, { x: 100, y: 50 }] },
  { id: 'aurelius', name: 'HALL OF AURELIUS', x: 200, y: 300, w: 200, h: 150,
    doors: [{ side: 'w', pos: 75 }, { side: 'e', pos: 75 }, { side: 'n', pos: 100 }],
    npc: { x: 100, y: 80, symbol: 'M', color: '#8B7355', thinkerId: 'aurelius' },
    artifacts: [{ x: 50, y: 40 }, { x: 150, y: 100 }] },
  { id: 'einstein', name: 'HALL OF EINSTEIN', x: 400, y: 300, w: 200, h: 150,
    doors: [{ side: 'w', pos: 75 }, { side: 's', pos: 100 }, { side: 'n', pos: 100 }],
    npc: { x: 100, y: 80, symbol: 'E', color: '#4169E1', thinkerId: 'einstein' },
    artifacts: [{ x: 40, y: 30 }, { x: 160, y: 120 }] },
  { id: 'sanctum', name: 'THE INNER SANCTUM', x: 400, y: 450, w: 200, h: 150,
    doors: [{ side: 'n', pos: 100 }],
    artifacts: [{ x: 100, y: 75 }] },
];

// ── Connect entrance to plato (N door) and socrates (implicit adjacency) ──
// Entrance S door → Socrates room is to the left, Plato is to the right
// Socrates E door connects to Plato W door at y=200
// Nietzsche E connects to Aurelius W at y=400
// Aurelius E connects to Einstein W at y=400
// Einstein S connects to Sanctum N at x=600

// ── PUZZLES ────────────────────────────────────────────────
interface Puzzle {
  question: string;
  answers: { text: string; correct: boolean; response: string }[];
  insight: string;
}

const PUZZLES: Record<string, Puzzle> = {
  socrates: {
    question: 'WHAT IS JUSTICE?',
    answers: [
      { text: 'Whatever benefits the stronger', correct: false, response: 'You sound like Thrasymachus. Think harder.' },
      { text: 'Giving each what they are owed', correct: false, response: 'Closer, but whose accounting do we trust?' },
      { text: 'Each part doing its own work in harmony', correct: true, response: 'Now you see. Justice is not a rule — it is a harmony.' },
    ],
    insight: 'The examined life is the only life worth living. Every question you refuse to ask is a prison you build for yourself.',
  },
  plato: {
    question: 'WHAT IS MORE REAL: THE SHADOW OR THE FORM?',
    answers: [
      { text: 'The shadow — it is what I can see', correct: false, response: 'You are still in the cave.' },
      { text: 'The form — it is the source of the shadow', correct: true, response: 'Turn toward the light. The pain of seeing is the beginning of wisdom.' },
      { text: 'Neither — reality is subjective', correct: false, response: 'A modern dodge. Plato would not be impressed.' },
    ],
    insight: 'Every imperfect thing you see points toward a perfect version you can almost imagine. Chase that image. Build toward it.',
  },
  nietzsche: {
    question: 'WHAT DOES THE ETERNAL RETURN DEMAND?',
    answers: [
      { text: 'That I endure my life repeating forever', correct: false, response: 'Endurance is not the point.' },
      { text: 'That I live so well I would choose this life again', correct: true, response: 'Yes. Would you will this moment eternally? That is the test of a life.' },
      { text: 'Nothing — it is a thought experiment', correct: false, response: 'Everything is a thought experiment. That does not make it less real.' },
    ],
    insight: 'The bold version of your life is the only version worth living. Stop hedging. Create or be consumed.',
  },
  aurelius: {
    question: 'WHAT IS IN YOUR CONTROL?',
    answers: [
      { text: 'My circumstances', correct: false, response: 'The emperor knows better than that.' },
      { text: 'My judgments and responses', correct: true, response: 'This is the whole of Stoic practice. Master this and you master yourself.' },
      { text: 'Nothing — fate decides everything', correct: false, response: 'Then why are you here, seeking answers?' },
    ],
    insight: 'You have exactly one task today. You already know what it is. Do that. Release everything else.',
  },
  einstein: {
    question: 'WHAT DOES E=MC² REALLY MEAN?',
    answers: [
      { text: 'Energy and mass are the same thing', correct: true, response: 'Everything is energy in disguise. Even you. Even this temple.' },
      { text: 'Light is the fastest thing', correct: false, response: 'That is a fact, not an insight.' },
      { text: 'Physics is math', correct: false, response: 'Physics is imagination disciplined by mathematics.' },
    ],
    insight: 'The universe is simpler than you think. The complexity is in your assumptions, not in reality.',
  },
};

// ── GAME COMPONENT ─────────────────────────────────────────
export default function TempleQuest() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const playerRef = useRef({ x: 300, y: 60 }); // Spawn in entrance (x=200..400, y=0..150)
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [exp, setExp] = useState(0);
  const [dialog, setDialog] = useState<{ thinkerId: string; phase: 'question' | 'wrong' | 'correct' | 'insight'; wrongMsg?: string } | null>(null);
  const [victory, setVictory] = useState(false);
  const [roomLabel, setRoomLabel] = useState('');
  const roomLabelTimer = useRef<NodeJS.Timeout | null>(null);
  const lastRoom = useRef('');
  const frameRef = useRef(0);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keysRef.current.add(e.key.toLowerCase()); };
    const up = (e: KeyboardEvent) => { keysRef.current.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Find which room a world point is in
  const findRoom = useCallback((wx: number, wy: number): Room | null => {
    return ROOMS.find(r => wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) || null;
  }, []);

  // Check if a point collides with walls
  const collidesWithWall = useCallback((wx: number, wy: number): boolean => {
    const room = findRoom(wx, wy);
    if (!room) return true; // Outside all rooms = wall

    // Check if in a doorway transition zone between rooms
    for (const r of ROOMS) {
      for (const d of r.doors) {
        const doorW = 30;
        let dx1: number, dy1: number, dx2: number, dy2: number;
        if (d.side === 'n') { dx1 = r.x + d.pos - doorW / 2; dy1 = r.y - 15; dx2 = dx1 + doorW; dy2 = r.y + 15; }
        else if (d.side === 's') { dx1 = r.x + d.pos - doorW / 2; dy1 = r.y + r.h - 15; dx2 = dx1 + doorW; dy2 = r.y + r.h + 15; }
        else if (d.side === 'w') { dx1 = r.x - 15; dy1 = r.y + d.pos - doorW / 2; dx2 = r.x + 15; dy2 = dy1 + doorW; }
        else { dx1 = r.x + r.w - 15; dy1 = r.y + d.pos - doorW / 2; dx2 = r.x + r.w + 15; dy2 = dy1 + doorW; }
        if (wx >= dx1 && wx <= dx2 && wy >= dy1 && wy <= dy2) return false;
      }
    }

    return !room;
  }, [findRoom]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    const gameLoop = () => {
      animId = requestAnimationFrame(gameLoop);
      frameRef.current++;
      const keys = keysRef.current;
      const p = playerRef.current;

      // Movement
      if (!dialog && !victory) {
        let dx = 0, dy = 0;
        if (keys.has('w') || keys.has('arrowup')) dy = -MOVE_SPEED;
        if (keys.has('s') || keys.has('arrowdown')) dy = MOVE_SPEED;
        if (keys.has('a') || keys.has('arrowleft')) dx = -MOVE_SPEED;
        if (keys.has('d') || keys.has('arrowright')) dx = MOVE_SPEED;
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!collidesWithWall(nx, ny)) { p.x = nx; p.y = ny; }
        else if (!collidesWithWall(nx, p.y)) { p.x = nx; }
        else if (!collidesWithWall(p.x, ny)) { p.y = ny; }
      }

      // Sanctum gate check
      const inSanctum = findRoom(p.x, p.y)?.id === 'sanctum';
      if (inSanctum && solved.size >= 3 && !victory) {
        setVictory(true);
      }
      // Block sanctum entry if not enough puzzles
      if (findRoom(p.x, p.y)?.id === 'sanctum' && solved.size < 3) {
        p.y = ROOMS.find(r => r.id === 'sanctum')!.y - 5;
      }

      // Room label
      const currentRoom = findRoom(p.x, p.y);
      if (currentRoom && currentRoom.id !== lastRoom.current) {
        lastRoom.current = currentRoom.id;
        setRoomLabel(currentRoom.name);
        if (roomLabelTimer.current) clearTimeout(roomLabelTimer.current);
        roomLabelTimer.current = setTimeout(() => setRoomLabel(''), 2000);
      }

      // Artifact collection
      for (const room of ROOMS) {
        for (const a of room.artifacts) {
          const key = `${room.id}-${a.x}-${a.y}`;
          if (collected.has(key)) continue;
          const ax = room.x + a.x, ay = room.y + a.y;
          if (Math.hypot(p.x - ax, p.y - ay) < 15) {
            setCollected(prev => new Set(prev).add(key));
            setExp(prev => prev + 2);
          }
        }
      }

      // Camera
      const cw = canvas.width, ch = canvas.height;
      const camX = p.x - cw / 2;
      const camY = p.y - ch / 2;

      // ── DRAW ──
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(-camX, -camY);

      // Draw rooms
      for (const room of ROOMS) {
        // Floor
        ctx.fillStyle = '#060606';
        ctx.fillRect(room.x, room.y, room.w, room.h);

        // Walls with door gaps
        ctx.strokeStyle = WALL;
        ctx.lineWidth = 2;

        const drawWallSegment = (x1: number, y1: number, x2: number, y2: number, side: 'n' | 's' | 'e' | 'w') => {
          const doors = room.doors.filter(d => d.side === side);
          if (doors.length === 0) {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            return;
          }
          // Sort gaps and draw segments between them
          const isHoriz = side === 'n' || side === 's';
          let segments: [number, number][] = [];
          const gapW = 30;
          let last = isHoriz ? x1 : y1;
          for (const d of doors.sort((a, b) => a.pos - b.pos)) {
            const center = isHoriz ? room.x + d.pos : room.y + d.pos;
            segments.push([last, center - gapW / 2]);
            last = center + gapW / 2;
          }
          segments.push([last, isHoriz ? x2 : y2]);
          for (const [a, b] of segments) {
            if (b - a < 2) continue;
            ctx.beginPath();
            if (isHoriz) { ctx.moveTo(a, y1); ctx.lineTo(b, y1); }
            else { ctx.moveTo(x1, a); ctx.lineTo(x1, b); }
            ctx.stroke();
          }
        };

        drawWallSegment(room.x, room.y, room.x + room.w, room.y, 'n');
        drawWallSegment(room.x, room.y + room.h, room.x + room.w, room.y + room.h, 's');
        drawWallSegment(room.x, room.y, room.x, room.y + room.h, 'w');
        drawWallSegment(room.x + room.w, room.y, room.x + room.w, room.y + room.h, 'e');

        // Room name
        ctx.fillStyle = `${GOLD}60`;
        ctx.font = '9px serif';
        ctx.textAlign = 'center';
        ctx.fillText(room.name, room.x + room.w / 2, room.y + 14);

        // Sanctum lock text
        if (room.id === 'sanctum' && solved.size < 3) {
          ctx.fillStyle = `${GOLD}40`;
          ctx.font = '8px serif';
          ctx.fillText(`SOLVE ${3 - solved.size} MORE TO ENTER`, room.x + room.w / 2, room.y - 8);
        }

        // Artifacts
        for (const a of room.artifacts) {
          const key = `${room.id}-${a.x}-${a.y}`;
          if (collected.has(key)) continue;
          const ax = room.x + a.x, ay = room.y + a.y;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = `${GOLD}${Math.floor(150 + Math.sin(frameRef.current * 0.05 + a.x) * 50).toString(16)}`;
          ctx.fillRect(-ARTIFACT_SIZE / 2, -ARTIFACT_SIZE / 2, ARTIFACT_SIZE, ARTIFACT_SIZE);
          ctx.restore();
        }

        // NPC
        if (room.npc) {
          const nx = room.x + room.npc.x, ny = room.y + room.npc.y;
          const isSolved = solved.has(room.npc.thinkerId);
          ctx.beginPath();
          ctx.arc(nx, ny, NPC_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = isSolved ? `${room.npc.color}40` : `${room.npc.color}88`;
          ctx.fill();
          ctx.strokeStyle = room.npc.color;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = room.npc.color;
          ctx.font = 'bold 14px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(room.npc.symbol, nx, ny);

          // Interact prompt
          if (!dialog && !isSolved && Math.hypot(p.x - nx, p.y - ny) < INTERACT_DIST) {
            ctx.fillStyle = `${GOLD}80`;
            ctx.font = '8px serif';
            ctx.textAlign = 'center';
            ctx.fillText('PRESS SPACE', nx, ny - NPC_RADIUS - 8);
          }
        }
      }

      // Player (hexagon)
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = PLAYER_SIZE * Math.cos(angle);
        const py = PLAYER_SIZE * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.restore();

      // ── HUD ──
      ctx.fillStyle = `${GOLD}80`;
      ctx.font = '10px serif';
      ctx.textAlign = 'left';
      ctx.fillText('TEMPLE LABYRINTH QUEST', 12, 20);

      ctx.textAlign = 'right';
      const totalArtifacts = ROOMS.reduce((sum, r) => sum + r.artifacts.length, 0);
      ctx.fillText(`⬡ ${collected.size}/${totalArtifacts} ARTIFACTS · ${solved.size}/5 PUZZLES · ${exp} EXP`, cw - 12, 20);

      // Room label
      if (roomLabel) {
        ctx.fillStyle = `${GOLD}60`;
        ctx.font = '12px serif';
        ctx.textAlign = 'center';
        ctx.fillText(roomLabel, cw / 2, ch - 20);
      }

      // Mini-map
      const mmX = cw - 120, mmY = 30, mmScale = 0.12;
      ctx.globalAlpha = 0.4;
      for (const room of ROOMS) {
        const rx = mmX + room.x * mmScale, ry = mmY + room.y * mmScale;
        const rw = room.w * mmScale, rh = room.h * mmScale;
        const isCurrent = findRoom(p.x, p.y)?.id === room.id;
        ctx.fillStyle = isCurrent ? GOLD : (solved.has(room.npc?.thinkerId || '') ? `${GOLD}80` : '#333');
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.globalAlpha = 1;
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, [dialog, victory, collected, solved, exp, collidesWithWall, findRoom, roomLabel]);

  // Store solved/dialog in refs for the event handler
  const solvedRef = useRef(solved);
  const dialogRef = useRef(dialog);
  useEffect(() => { solvedRef.current = solved; }, [solved]);
  useEffect(() => { dialogRef.current = dialog; }, [dialog]);

  // Space to interact
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      e.preventDefault();
      if (dialogRef.current) return;
      const p = playerRef.current;
      for (const room of ROOMS) {
        if (!room.npc || solvedRef.current.has(room.npc.thinkerId)) continue;
        const nx = room.x + room.npc.x, ny = room.y + room.npc.y;
        const dist = Math.hypot(p.x - nx, p.y - ny);
        if (dist < INTERACT_DIST) {
          setDialog({ thinkerId: room.npc.thinkerId, phase: 'question' });
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Handle answer
  function handleAnswer(answerIdx: number) {
    if (!dialog) return;
    const puzzle = PUZZLES[dialog.thinkerId];
    const answer = puzzle.answers[answerIdx];
    if (answer.correct) {
      setDialog({ thinkerId: dialog.thinkerId, phase: 'correct' });
      setSolved(prev => new Set(prev).add(dialog.thinkerId));
      setExp(prev => prev + 10);
    } else {
      setDialog({ thinkerId: dialog.thinkerId, phase: 'wrong', wrongMsg: answer.response });
    }
  }

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const puzzle = dialog ? PUZZLES[dialog.thinkerId] : null;

  return (
    <div style={{ width: '100vw', height: '100vh', background: BG, overflow: 'hidden', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />

      {/* Dialog overlay */}
      {dialog && puzzle && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.95)', border: `1px solid ${GOLD}33`, padding: '2rem', maxHeight: '40vh', overflow: 'auto' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: GOLD, marginBottom: '1rem' }}>
              {dialog.thinkerId.toUpperCase()} ASKS
            </div>
            {dialog.phase === 'question' && (
              <>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: '#E8DCC8', marginBottom: '1.5rem', letterSpacing: '0.08em' }}>
                  {puzzle.question}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {puzzle.answers.map((a, i) => (
                    <button key={i} onClick={() => handleAnswer(i)} style={{
                      background: 'rgba(197,165,90,0.06)', border: `1px solid ${GOLD}33`, padding: '12px 16px',
                      color: '#E8DCC8', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px',
                      textAlign: 'left', cursor: 'pointer', lineHeight: 1.5,
                    }}>
                      {String.fromCharCode(65 + i)}) {a.text}
                    </button>
                  ))}
                </div>
              </>
            )}
            {dialog.phase === 'wrong' && (
              <>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: '#c05050', fontStyle: 'italic', marginBottom: '1rem' }}>
                  {dialog.wrongMsg}
                </div>
                <button onClick={() => setDialog({ thinkerId: dialog.thinkerId, phase: 'question' })} style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: GOLD,
                  background: 'none', border: `1px solid ${GOLD}44`, padding: '8px 20px', cursor: 'pointer',
                }}>TRY AGAIN</button>
              </>
            )}
            {dialog.phase === 'correct' && (
              <>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: GOLD, fontStyle: 'italic', marginBottom: '1rem' }}>
                  {puzzle.answers.find(a => a.correct)?.response}
                </div>
                <button onClick={() => setDialog({ thinkerId: dialog.thinkerId, phase: 'insight' })} style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000',
                  background: GOLD, border: 'none', padding: '8px 20px', cursor: 'pointer',
                }}>+10 EXP — CONTINUE</button>
              </>
            )}
            {dialog.phase === 'insight' && (
              <>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: '#E8DCC8', lineHeight: 1.8, fontStyle: 'italic' }}>
                  {puzzle.insight}
                </div>
                <button onClick={() => setDialog(null)} style={{
                  marginTop: '1rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                  color: GOLD, background: 'none', border: `1px solid ${GOLD}44`, padding: '8px 20px', cursor: 'pointer',
                }}>CLOSE</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Victory screen */}
      {victory && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: GOLD, opacity: 0.3, marginBottom: '1rem' }}>⬡</div>
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.15em', color: '#E8DCC8', marginBottom: '1rem' }}>
              YOU HAVE REACHED<br />THE INNER SANCTUM
            </h1>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: DIM, marginBottom: '2rem', lineHeight: 2 }}>
              {solved.size}/5 PUZZLES SOLVED<br />
              {collected.size}/{ROOMS.reduce((s, r) => s + r.artifacts.length, 0)} ARTIFACTS COLLECTED<br />
              {exp} EXP EARNED
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <button onClick={() => {
                navigator.clipboard.writeText(`I reached the Inner Sanctum of the Society of Explorers. ${solved.size}/5 puzzles solved, ${collected.size} artifacts collected. societyofexplorers.com/temple-quest`);
              }} style={{
                fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: GOLD,
                background: 'none', border: `1px solid ${GOLD}44`, padding: '10px 24px', cursor: 'pointer',
              }}>SHARE YOUR JOURNEY</button>
              <a href="/salon" style={{
                fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#000',
                background: GOLD, padding: '12px 30px', textDecoration: 'none',
              }}>ENTER THE REAL TEMPLE →</a>
            </div>
          </div>
        </div>
      )}

      {/* Mobile d-pad */}
      <div style={{ position: 'absolute', bottom: '20px', left: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', opacity: 0.4 }}>
        <button onTouchStart={() => keysRef.current.add('w')} onTouchEnd={() => keysRef.current.delete('w')}
          style={{ width: '44px', height: '44px', background: `${GOLD}22`, border: `1px solid ${GOLD}44`, color: GOLD, fontSize: '16px', cursor: 'pointer' }}>↑</button>
        <div style={{ display: 'flex', gap: '2px' }}>
          <button onTouchStart={() => keysRef.current.add('a')} onTouchEnd={() => keysRef.current.delete('a')}
            style={{ width: '44px', height: '44px', background: `${GOLD}22`, border: `1px solid ${GOLD}44`, color: GOLD, fontSize: '16px', cursor: 'pointer' }}>←</button>
          <button onTouchStart={() => keysRef.current.add('s')} onTouchEnd={() => keysRef.current.delete('s')}
            style={{ width: '44px', height: '44px', background: `${GOLD}22`, border: `1px solid ${GOLD}44`, color: GOLD, fontSize: '16px', cursor: 'pointer' }}>↓</button>
          <button onTouchStart={() => keysRef.current.add('d')} onTouchEnd={() => keysRef.current.delete('d')}
            style={{ width: '44px', height: '44px', background: `${GOLD}22`, border: `1px solid ${GOLD}44`, color: GOLD, fontSize: '16px', cursor: 'pointer' }}>→</button>
        </div>
      </div>

      {/* Mobile interact button */}
      <button onTouchStart={() => { const e = new KeyboardEvent('keydown', { key: ' ' }); window.dispatchEvent(e); }}
        style={{ position: 'absolute', bottom: '30px', right: '20px', width: '60px', height: '60px', borderRadius: '50%', background: `${GOLD}22`, border: `1px solid ${GOLD}44`, color: GOLD, fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', cursor: 'pointer', opacity: 0.4 }}>
        TALK
      </button>

      {/* Back link */}
      <a href="/salon" style={{ position: 'absolute', top: '12px', left: '12px', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: GOLD, textDecoration: 'none', opacity: 0.4, zIndex: 10 }}>← SALON</a>
    </div>
  );
}
