'use client';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import FellowshipInvitation from '@/components/FellowshipInvitation';
import { track } from '@/lib/analytics/client';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { fetchPulse, type PulseQuestion } from '@/lib/feed/pulseClient';
import { PhilosophicalSurvey, type PhilosophicalProjection } from '@/components/onboarding/PhilosophicalSurvey';
import { CollaborationSandbox } from '@/components/workspace/CollaborationSandbox';
import { usePodSync, type PodSyncBuildContext } from '@/lib/hooks/usePodSync';
import {
  applyProjectEscrowMutation,
  useProjectEscrow,
  type ProjectEscrowMutation,
} from '@/lib/hooks/useProjectEscrow';
import {
  SYNC_CIPHERTEXT_ENCODING,
  SYNC_ENVELOPE_KIND,
  SYNC_ENVELOPE_VERSION,
  canonicalSyncCommitmentInput,
  type PodSyncEnvelope,
} from '@/lib/movement/podSync';
import type { ExplorerGraph } from '@/lib/movement/explorerGraph';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius',
  nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs',
};
const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', aurelius: '#8B7355',
  nietzsche: '#DC143C', einstein: '#4169E1', jobs: '#A0A0A0',
};
const THINKER_AVATARS: Record<string, string> = {
  socrates: 'SO', plato: 'PL', aurelius: 'MA',
  nietzsche: 'FN', einstein: 'AE', jobs: 'SJ',
};

type NetworkPanel = 'survey' | 'sandbox';
const HOMEPAGE_PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const HOMEPAGE_POD_KEY_STORAGE = 'soe:homepage-pod-key:v1';
const HOMEPAGE_GRAPH_STORAGE = 'soe:homepage-explorer-graph:v1';
const PROMPT_ATLAS_URL = 'https://prompts-mvp.vercel.app';

export default function HomePage() {
  const [question, setQuestion] = useState<PulseQuestion | null>(null);
  const [networkPanel, setNetworkPanel] = useState<NetworkPanel>('survey');
  const [surveyProjection, setSurveyProjection] = useState<PhilosophicalProjection | null>(null);
  const podSync = usePodSync<ExplorerGraph, ProjectEscrowMutation>({
    storageKey: HOMEPAGE_GRAPH_STORAGE,
    initialState: createHomepageExplorerGraph,
    autoSync: false,
    stream: false,
    applyMutation: (state, mutation) => applyProjectEscrowMutation(state, mutation),
    buildEnvelope: buildHomepagePodEnvelope,
  });
  const escrowPreview = useProjectEscrow({ graph: podSync.state });
  const sandboxProject = escrowPreview.getProject(HOMEPAGE_PROJECT_ID);
  const syncState = useMemo(
    () => ({
      sync_status: podSync.sync_status,
      pending_count: podSync.pending_count,
      is_dirty: podSync.is_dirty,
      last_audit_id: podSync.last_audit_id,
      next_retry_at: podSync.next_retry_at,
      last_error: podSync.last_error,
      last_synced_at: podSync.last_synced_at,
    }),
    [
      podSync.is_dirty,
      podSync.last_audit_id,
      podSync.last_error,
      podSync.last_synced_at,
      podSync.next_retry_at,
      podSync.pending_count,
      podSync.sync_status,
    ],
  );

  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  // Preview the latest published question without creating a new one.
  useEffect(() => {
    let current = true;
    void fetchPulse().then(result => { if (current && result.ok) setQuestion(result.data.todayQuestion); });
    return () => { current = false; };
  }, []);

  const tId = question?.thinker_id || '';
  const tName = THINKER_NAMES[tId] || '';
  const tColor = THINKER_COLORS[tId] || gold;
  const tAvatar = THINKER_AVATARS[tId] || '??';

  return <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
    <a href="#main" className="soe-skip-link">Skip to content</a>
    <PublicNav />

    <main id="main" tabIndex={-1}>
      {/* HERO */}
      <section style={{ minHeight: 'calc(100vh - 56px)', padding: '8rem 2rem 4rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>
            SOCIETY OF EXPLORERS
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.05, marginBottom: '1.5rem', color: parchment }}>
            Read together. Meet online.
          </h1>
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: ivory85, lineHeight: 1.7, maxWidth: '640px', margin: '0 auto 2.5rem' }}>
            Small weekly salons rooted in Christian faith. Read Scripture and the Great Books, make room for prayer, and welcome people who disagree in good faith.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <Link href={ONLINE_CIRCLES_HREF} prefetch={false} style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '0 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '52px' }}>
              FIND AN ONLINE CIRCLE
            </Link>
            <Link href="/clips" prefetch={false} style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}66`, padding: '0 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '52px' }}>
              EXPLORE CLIPS
            </Link>
          </div>
          <p style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: muted, lineHeight: 1.8, margin: '1.25rem auto 0', maxWidth: '620px' }}>
            Browse public listings. Members get access to their Circle’s private discussion and online meeting link.
          </p>
        </div>
      </section>

      <FellowshipInvitation />

      {/* LATEST PUBLISHED QUESTION */}
      {question && (
        <section style={{ padding: '2rem 2rem 3rem' }}>
          <div style={{ maxWidth: '560px', margin: '0 auto', background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '2rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${tColor}18`, border: `1.5px solid ${tColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', color: tColor }}>
                {tAvatar}
              </div>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: tColor }}>
                {tName ? `A QUESTION FROM ${tName.toUpperCase()}` : 'LATEST PUBLISHED QUESTION'}
              </span>
            </div>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.5, color: parchment, textAlign: 'center', margin: 0, marginBottom: '1.75rem' }}>
              &ldquo;{question.question_text}&rdquo;
            </p>
            <div style={{ textAlign: 'center' }}>
              <a href="/practice" onClick={() => track('cta_click', { cta: 'daily_question_respond' })} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}66`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '44px' }}>
                OPEN THE DAILY PRACTICE &rarr;
              </a>
            </div>
          </div>
        </section>
      )}

      {/* NETWORK HANDSHAKE */}
      <section id="network-handshake" style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>
              PRIVATE NETWORK HANDSHAKE
            </div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>
              Align, invite, build.
            </h2>
            <p style={{ fontSize: '15px', color: muted, lineHeight: 1.7, maxWidth: '620px', margin: '0 auto' }}>
              Your profile stays local. Your collaboration workspace moves through encrypted pod sync and Base multi-sig checkpoints.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '8px',
              maxWidth: '620px',
              margin: '0 auto 1.25rem',
              border: `1px solid ${gold}22`,
              background: '#0d0d0d',
              padding: '6px',
            }}
          >
            <button
              type="button"
              onClick={() => setNetworkPanel('survey')}
              style={{
                minHeight: '48px',
                border: 'none',
                background: networkPanel === 'survey' ? gold : 'transparent',
                color: networkPanel === 'survey' ? '#0a0a0a' : parchment,
                fontFamily: 'Cinzel, serif',
                fontSize: '10px',
                letterSpacing: '0.14em',
                cursor: 'pointer',
              }}
            >
              Philosophical Alignment Survey
            </button>
            <button
              type="button"
              onClick={() => setNetworkPanel('sandbox')}
              style={{
                minHeight: '48px',
                border: 'none',
                background: networkPanel === 'sandbox' ? gold : 'transparent',
                color: networkPanel === 'sandbox' ? '#0a0a0a' : parchment,
                fontFamily: 'Cinzel, serif',
                fontSize: '10px',
                letterSpacing: '0.14em',
                cursor: 'pointer',
              }}
            >
              Collaboration Multi-Sig Sandbox
            </button>
          </div>

          {networkPanel === 'survey' ? (
            <div
              style={{
                display: 'grid',
                gap: '1.25rem',
                gridTemplateColumns: 'minmax(0, 1fr)',
                maxWidth: '760px',
                margin: '0 auto',
                border: `1px solid ${gold}22`,
                background: '#0d0d0d',
                padding: '1.25rem',
              }}
            >
              <PhilosophicalSurvey onProjectionChange={setSurveyProjection} />
              <div
                style={{
                  borderTop: `1px solid ${gold}18`,
                  paddingTop: '1rem',
                  display: 'grid',
                  gap: '0.5rem',
                  color: muted,
                  fontSize: '13px',
                }}
              >
                <span style={{ color: parchment }}>
                  Current role: {surveyProjection?.primary_builder_archetype || podSync.state.coordination_profiles.primary_builder_archetype}
                </span>
                <span>
                  Local pod queue: {podSync.pending_count} pending mutation{podSync.pending_count === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  marginBottom: '0.75rem',
                  color: muted,
                  fontSize: '13px',
                }}
              >
                <span>Workspace status: {sandboxProject?.workspace_status || 'proposed'}</span>
                <span>Encrypted pod queue: {podSync.pending_count}</span>
              </div>
              <CollaborationSandbox
                graph={podSync.state}
                projectId={HOMEPAGE_PROJECT_ID}
                syncTarget={podSync}
                syncState={syncState}
              />
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="apology-guide" style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>A QUESTION FOR YOUR SALON</p>
          <h2 id="apology-guide" style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>
            What does it mean to examine your life?
          </h2>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.7, marginBottom: '1.25rem' }}>
            In Plato’s <em>Apology</em>, Socrates defends the habit of questioning what we think we know.
            What would that habit look like in your own life?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
            <Link href="/circles/path/2" prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
              Open the Apology discussion guide
            </Link>
            <Link href={ONLINE_CIRCLES_HREF} prefetch={false} style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
              Find a salon online
            </Link>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ padding: '2rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '440px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 28px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.5rem' }}>Start your practice.</h2>
          <p style={{ fontSize: '15px', color: muted, marginBottom: '1.75rem' }}>Free. One question. Every morning.</p>
          <a href="/practice" onClick={() => track('cta_click', { cta: 'footer_todays_question' })} style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>TODAY&apos;S QUESTION &rarr;</a>
          <p style={{ fontSize: '15px', color: muted, marginTop: '1.75rem' }}>Explore the separate <a href={PROMPT_ATLAS_URL} style={{ color: gold }} onClick={() => track('cta_click', { cta: 'footer_prompt_atlas' })}>Prompt Atlas workspace</a> or <a href={`${PROMPT_ATLAS_URL}/p/create-a-one-page-business`} style={{ color: gold }} onClick={() => track('cta_click', { cta: 'footer_public_prompt' })}>view a public prompt</a>.</p>
        </div>
      </section>

    </main>
    <PublicFooter />
  </div>;
}

function createHomepageExplorerGraph(): ExplorerGraph {
  const now = new Date().toISOString();

  return {
    schema_version: 2,
    updated_at: now,
    epistemic_vectors: {
      rationalism_vs_empiricism: 0.2,
      risk_acceleration_tolerance: 0.35,
      open_source_conviction: 0.72,
    },
    coordination_profiles: {
      primary_builder_archetype: 'Systems Architect',
      decentralization_conviction: 0.86,
      synergistic_skills: ['Protocol design', 'Research synthesis', 'Community stewardship'],
    },
    consciousness_telemetry: {
      measured_perspective_scale: 0.68,
      cohesion_analytics_index: 0.74,
    },
    project_milestone_scaffolding: {
      escrow_settlement_preferences: {
        preferred_chain_id: 84532,
        fallback_arbitration_enabled: true,
      },
      active_collaborations: [
        {
          project_id: HOMEPAGE_PROJECT_ID,
          title: 'Sovereign Collaboration Sandbox',
          description: 'A scoped workspace for testing trust, milestone funding, and member-owned project state.',
          workspace_status: 'proposed',
          creator_member_id: '22222222-2222-4222-8222-222222222222',
          partner_member_id: '33333333-3333-4333-8333-333333333333',
          multisig_config: {
            chain_id: 84532,
            multisig_address: '0x0000000000000000000000000000000000000000',
            threshold: 2,
            signers: [
              '0x1111111111111111111111111111111111111111',
              '0x2222222222222222222222222222222222222222',
            ],
          },
          milestone_definitions: [
            {
              milestone_id: 1,
              title: 'Shared charter',
              description: 'Define project scope, member responsibilities, and data boundaries.',
              payout_amount_wei: '10000000000000000',
              status: 'pending',
              completed: false,
            },
            {
              milestone_id: 2,
              title: 'Prototype handoff',
              description: 'Deliver a working sandbox artifact with private state preserved in the pod.',
              payout_amount_wei: '25000000000000000',
              status: 'pending',
              completed: false,
            },
            {
              milestone_id: 3,
              title: 'Release validation',
              description: 'Attach the funding transaction and release payout after both signers confirm.',
              payout_amount_wei: '40000000000000000',
              status: 'pending',
              completed: false,
            },
          ],
          created_at: now,
          updated_at: now,
        },
      ],
    },
  };
}

async function buildHomepagePodEnvelope(
  state: ExplorerGraph,
  context: PodSyncBuildContext<ProjectEscrowMutation>,
): Promise<PodSyncEnvelope> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await getOrCreateHomepagePodKey();
  const encoded = new TextEncoder().encode(JSON.stringify(state));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(encoded));
  const ciphertext = bytesToBase64(new Uint8Array(encrypted));
  const ivBase64 = bytesToBase64(iv);
  const envelopeWithoutCommitment: Omit<PodSyncEnvelope, 'commitment_hash'> = {
    kind: SYNC_ENVELOPE_KIND,
    version: SYNC_ENVELOPE_VERSION,
    ciphertext_encoding: SYNC_CIPHERTEXT_ENCODING,
    ciphertext,
    iv: ivBase64,
    client_updated_at: context.client_updated_at,
    device_id: context.device_id,
    base_sync_version: context.base_sync_version,
    metadata: {
      surface: 'homepage-collaboration-sandbox',
      schema_version: state.schema_version,
      key_mode: 'client_local',
      custody: 'browser_local_storage',
      key_derivation: 'browser_random_aes_gcm_v1',
      sovereignty_level: 'client_held_prototype',
      key_exportable: false,
      server_can_decrypt_pod: false,
      attestation: 'client_local_browser_key',
      base_sync_version: context.base_sync_version,
    },
  };
  const commitmentInput = canonicalSyncCommitmentInput(envelopeWithoutCommitment);
  const commitmentHash = await sha256Hex(new TextEncoder().encode(commitmentInput));

  return {
    ...envelopeWithoutCommitment,
    commitment_hash: commitmentHash,
  };
}

async function getOrCreateHomepagePodKey(): Promise<CryptoKey> {
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(HOMEPAGE_POD_KEY_STORAGE) : null;
  if (stored) {
    return crypto.subtle.importKey('raw', toArrayBuffer(base64ToBytes(stored)), 'AES-GCM', false, ['encrypt']);
  }

  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(HOMEPAGE_POD_KEY_STORAGE, bytesToBase64(raw));
  }
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), 'AES-GCM', false, ['encrypt']);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.byteLength; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
