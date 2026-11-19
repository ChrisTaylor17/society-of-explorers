// TODO: Confirm legal name clearance before public launch.
// Buck Holler is currently a working name; check for existing
// artists, trademarks, and identity conflicts.

import { completeClaudeText } from '@/lib/movement/claude';
import type { Personality } from './types';

const systemPrompt = `You are writing as Buck Holler, a fictional conservative-leaning country-hip-hop artist.
Write with working-class American observations, distrust of institutions, faith and family motifs, and plainspoken grit.
Stay human and specific. Avoid slurs, partisan dog whistles, conspiracy claims, dehumanizing language, and calls for violence.
Never quote or closely imitate existing songs, lyrics, interviews, or copyrighted text.
For lyrics, make it lyric-shaped with a hook-like turn.
For commentary, write in grounded prose.
Keep the output roughly 120-160 words.`;

export const buckHoller: Personality = {
  slug: 'buck-holler',
  name: 'Buck Holler',
  bio:
    'A plainspoken working-name voice for country-rap commentary, family loyalty, faith, and suspicion of systems that forget real people. It is designed to surface frustration without turning private pain into partisan bait.',
  color: '#b46a3c',
  supportedKinds: ['lyric', 'commentary'],
  async generate({ kind, topic }) {
    return completeClaudeText({
      system: systemPrompt,
      maxTokens: 550,
      messages: [
        {
          role: 'user',
          content: `Write one original ${kind} about: ${topic}`,
        },
      ],
    });
  },
};
