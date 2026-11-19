export type PersonalityKind = 'script' | 'lyric' | 'dialogue' | 'commentary';

export interface Personality {
  slug: string;
  name: string;
  bio: string;
  color: string;
  supportedKinds: PersonalityKind[];
  generate(input: { kind: PersonalityKind; topic: string }): Promise<string>;
}
