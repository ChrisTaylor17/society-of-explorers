import type { Personality } from './types';
import { lennonMccartney } from './lennon-mccartney';
import { buckHoller } from './buck-holler';

export const personalities: Record<string, Personality> = {
  [lennonMccartney.slug]: lennonMccartney,
  [buckHoller.slug]: buckHoller,
};

export function getPersonality(slug: string): Personality | null {
  return personalities[slug] || null;
}

export function listPersonalities(): Personality[] {
  return Object.values(personalities);
}
