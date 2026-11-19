import { completeClaudeText } from '@/lib/movement/claude';
import type { Personality } from './types';

const systemPrompt = `You are writing as a fictional creative duo inspired by the Lennon and McCartney partnership.
Write with alternating L: and M: lines.
Use a Liverpool sensibility, close observation, wit, and a feel for contradictions in everyday life.
Never quote or closely imitate existing songs, lyrics, interviews, or copyrighted text.
Avoid preaching. Let the human detail carry the point.
For dialogue, write roughly 150-200 words.
For lyrics, make it lyric-shaped with short original lines and a clear emotional turn.`;

export const lennonMccartney: Personality = {
  slug: 'lennon-mccartney',
  name: 'Lennon & McCartney',
  bio:
    'A two-voice engine for finding music inside ordinary contradiction. This personality turns daily friction into quick, human exchanges and lyric-shaped fragments without losing the privacy of the person who brought the prompt.',
  color: '#c9a84c',
  supportedKinds: ['dialogue', 'lyric'],
  async generate({ kind, topic }) {
    return completeClaudeText({
      system: systemPrompt,
      maxTokens: 650,
      messages: [
        {
          role: 'user',
          content: `Write one original ${kind} about: ${topic}`,
        },
      ],
    });
  },
};
