'use client';

import { useMemo, useState } from 'react';
import type { BuilderArchetype, EpistemicVectors } from '@/lib/movement/explorerGraph';

export interface PhilosophicalProjection {
  epistemic_vectors: EpistemicVectors;
  primary_builder_archetype: BuilderArchetype;
  decentralization_conviction: number;
  synergistic_skills: string[];
}

export interface PhilosophicalSurveyProps {
  onProjectionChange?: (projection: PhilosophicalProjection) => void;
}

interface QuestionConfig {
  id: keyof EpistemicVectors | 'decentralization_conviction';
  prompt: string;
  left: string;
  right: string;
}

const QUESTIONS: QuestionConfig[] = [
  {
    id: 'rationalism_vs_empiricism',
    prompt: 'How do you usually find truth?',
    left: 'Pattern and reason',
    right: 'Observation and proof',
  },
  {
    id: 'risk_acceleration_tolerance',
    prompt: 'What pace feels honest for important work?',
    left: 'Careful and deliberate',
    right: 'Fast and experimental',
  },
  {
    id: 'open_source_conviction',
    prompt: 'Where should durable knowledge live?',
    left: 'Held by trusted stewards',
    right: 'Open for the commons',
  },
  {
    id: 'decentralization_conviction',
    prompt: 'What should members control directly?',
    left: 'Shared institutions',
    right: 'Personal sovereignty',
  },
];

const ARCHETYPES: BuilderArchetype[] = [
  'Systems Architect',
  'Visionary Philosopher',
  'Algorithmic Operator',
  'Growth Catalyst',
];

const SKILLS = [
  'Product strategy',
  'Protocol design',
  'Research synthesis',
  'Community stewardship',
  'Creative direction',
  'Full-stack engineering',
  'Token economics',
  'Operations',
];

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const muted = '#9a8f7a';

export function PhilosophicalSurvey({ onProjectionChange }: PhilosophicalSurveyProps) {
  const [answers, setAnswers] = useState<Record<QuestionConfig['id'], number>>({
    rationalism_vs_empiricism: 0,
    risk_acceleration_tolerance: 0,
    open_source_conviction: 0,
    decentralization_conviction: 0.4,
  });
  const [archetype, setArchetype] = useState<BuilderArchetype>('Systems Architect');
  const [skills, setSkills] = useState<string[]>(['Protocol design', 'Research synthesis']);

  const projection = useMemo<PhilosophicalProjection>(
    () => ({
      epistemic_vectors: {
        rationalism_vs_empiricism: roundVector(answers.rationalism_vs_empiricism),
        risk_acceleration_tolerance: roundVector(answers.risk_acceleration_tolerance),
        open_source_conviction: roundVector(answers.open_source_conviction),
      },
      primary_builder_archetype: archetype,
      decentralization_conviction: roundVector(answers.decentralization_conviction),
      synergistic_skills: skills,
    }),
    [answers, archetype, skills],
  );

  const updateAnswer = (id: QuestionConfig['id'], value: string) => {
    const nextAnswers = {
      ...answers,
      [id]: Number.parseFloat(value),
    };
    setAnswers(nextAnswers);
    onProjectionChange?.({
      epistemic_vectors: {
        rationalism_vs_empiricism: roundVector(nextAnswers.rationalism_vs_empiricism),
        risk_acceleration_tolerance: roundVector(nextAnswers.risk_acceleration_tolerance),
        open_source_conviction: roundVector(nextAnswers.open_source_conviction),
      },
      primary_builder_archetype: archetype,
      decentralization_conviction: roundVector(nextAnswers.decentralization_conviction),
      synergistic_skills: skills,
    });
  };

  const updateArchetype = (value: BuilderArchetype) => {
    setArchetype(value);
    onProjectionChange?.({ ...projection, primary_builder_archetype: value });
  };

  const toggleSkill = (skill: string) => {
    const nextSkills = skills.includes(skill)
      ? skills.filter((entry) => entry !== skill)
      : [...skills, skill].slice(0, 6);
    setSkills(nextSkills);
    onProjectionChange?.({ ...projection, synergistic_skills: nextSkills });
  };

  return (
    <section style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {QUESTIONS.map((question) => (
          <label
            key={question.id}
            style={{
              display: 'grid',
              gap: '0.75rem',
              padding: '1rem',
              border: `1px solid ${gold}22`,
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '10px',
                letterSpacing: '0.14em',
                color: gold,
              }}
            >
              {question.prompt}
            </span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.1"
              value={answers[question.id]}
              onChange={(event) => updateAnswer(question.id, event.target.value)}
              style={{ width: '100%', accentColor: gold }}
            />
            <span
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                fontSize: '13px',
                color: muted,
              }}
            >
              <span>{question.left}</span>
              <span style={{ color: parchment }}>{formatVector(answers[question.id])}</span>
              <span>{question.right}</span>
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.14em', color: gold }}>
          Builder posture
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {ARCHETYPES.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => updateArchetype(entry)}
              style={{
                border: `1px solid ${entry === archetype ? gold : `${gold}33`}`,
                background: entry === archetype ? `${gold}22` : 'transparent',
                color: entry === archetype ? parchment : muted,
                padding: '0.6rem 0.75rem',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.14em', color: gold }}>
          Collaboration strengths
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {SKILLS.map((skill) => {
            const active = skills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                style={{
                  border: `1px solid ${active ? '#5eead4' : `${gold}33`}`,
                  background: active ? 'rgba(20,184,166,0.16)' : 'transparent',
                  color: active ? parchment : muted,
                  padding: '0.55rem 0.7rem',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {skill}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '0.5rem',
          padding: '1rem',
          border: '1px solid rgba(94,234,212,0.25)',
          background: 'rgba(20,184,166,0.08)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '12px',
          color: '#ccfbf1',
          overflowX: 'auto',
        }}
      >
        <span>projection.primary_builder_archetype = {projection.primary_builder_archetype}</span>
        <span>projection.decentralization_conviction = {projection.decentralization_conviction}</span>
        <span>projection.synergistic_skills = [{projection.synergistic_skills.join(', ')}]</span>
      </div>
    </section>
  );
}

function roundVector(value: number): number {
  return Math.round(Math.max(-1, Math.min(1, value)) * 10) / 10;
}

function formatVector(value: number): string {
  const rounded = roundVector(value);
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

export default PhilosophicalSurvey;
