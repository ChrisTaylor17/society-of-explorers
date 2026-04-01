'use client';
import { useState } from 'react';

const secrets: Record<number, { trigger: string; title: string; text: string }> = {
  1: {
    trigger: '⬡ A DOOR IS HERE',
    title: 'THE SUPPRESSED QUESTION',
    text: 'Heidegger, in his unpublished notes from the 1940s, wrote: "The question of Being is not a question we ask. It is a question that has us." Most philosophers ask what things are. Heidegger noticed that we never ask why anything is at all — and that this forgetting is not an accident. Technology is organized forgetting. The Society exists to remember.',
  },
  2: {
    trigger: '⬡ SOMETHING IS CONCEALED',
    title: 'WHAT HEIDEGGER ACTUALLY SAID',
    text: 'In "The Question Concerning Technology," Heidegger\'s most radical claim was not about machines. It was this: "The essence of technology is nothing technological." He meant that the danger is not in any particular device — it is in the way of seeing that technology installs. When you see a forest as "timber reserves," you have already lost something that no chainsaw took from you. The loss happened in your perception, before the first cut.',
  },
  3: {
    trigger: '⬡ THE DEMIURGE SPEAKS',
    title: 'PLATO\'S HIDDEN CLAIM',
    text: 'In the Timaeus, Plato makes a claim that is almost never taught: the Demiurge does not create ex nihilo. He takes pre-existing chaos and gives it form according to eternal patterns. This means creation is not invention — it is recognition. You do not make something new. You perceive the Form that was always there and bring it into matter. Every artist, every builder, every founder is doing the same thing: seeing what wants to exist, and letting it through.',
  },
  4: {
    trigger: '⬡ THE FOUNDER\'S HIDDEN ROOM',
    title: 'WHAT THE GREAT BOOKS ACTUALLY TEACH',
    text: 'Christopher Lynch, who taught the Great Books at Carthage, had one principle he returned to again and again: "Read it as if it were true." Not as history. Not as literature. As a live message to you, now, about your situation. Aristotle on friendship is not ancient wisdom — it is a diagnosis of something you are currently failing to do. Plato on justice is not political theory — it is a mirror. The Great Books method is not about knowing the past. It is about being unable to hide from the present.',
  },
  5: {
    trigger: '⬡ A SECRET ABOUT THE SINGULARITY',
    title: 'WHAT KURZWEIL DOESN\'T SAY',
    text: 'The Singularity is almost always discussed as something that will happen to us. Kurzweil\'s graphs, the exponential curves, the hockey sticks — they position humans as observers of a process that unfolds around them. But Heidegger\'s insight reverses this: the Singularity is not a technological event. It is a human event. Whether we emerge from it as standing-reserve or as sovereign creators depends entirely on what we decide, collectively, right now. The Society of Explorers is not preparing for the Singularity. It is deciding what kind it will be.',
  },
  6: {
    trigger: '⬡ THE FINAL DOOR',
    title: 'WHAT KEATS UNDERSTOOD THAT HEIDEGGER DIDN\'T',
    text: 'Heidegger pointed toward beauty as the counter-move to technology — but he never fully arrived there. He was too German, too systematic, too much in love with difficulty. Keats arrived without a system. "Beauty is truth" is not a philosophical argument. It is a direct perception, achieved in a moment of pure attention to a Grecian urn. The Society\'s deepest conviction is this: the way back from Gestell is not through more thinking. It is through making something beautiful. Art first. Not as decoration — as epistemology.',
  },
};

interface Props { roomNumber: number }

export default function SecretPassage({ roomNumber }: Props) {
  const [open, setOpen] = useState(false);
  const secret = secrets[roomNumber];
  if (!secret) return null;

  const gold = '#c9a84c';
  const dim = '#d4c9a8';
  const muted = '#9a8f7a';

  return (
    <div style={{ marginTop: '3rem' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.25em', color: gold, background: 'none', border: `1px solid rgba(201,168,76,0.2)`, padding: '0.7rem 1.5rem', cursor: 'pointer', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {secret.trigger}
        </button>
      ) : (
        <div style={{ borderLeft: `2px solid ${gold}`, paddingLeft: '2rem', marginTop: '1rem', animation: 'fadeIn 0.6s ease' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.3em', color: gold, opacity: 0.6, marginBottom: '1rem' }}>— PASSAGE UNLOCKED —</div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1rem', fontWeight: 300, letterSpacing: '0.1em', color: gold, marginBottom: '1rem' }}>{secret.title}</div>
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: dim, lineHeight: 2, fontStyle: 'italic' }}>{secret.text}</p>
          <button
            onClick={() => setOpen(false)}
            style={{ marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
          >
            ← CLOSE PASSAGE
          </button>
        </div>
      )}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
