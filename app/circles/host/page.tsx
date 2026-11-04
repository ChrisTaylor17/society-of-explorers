import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { WEEKLY_LOOP } from '@/lib/circles/path';
import { body, button, card, gold, h1, h2, label, lead, main, page, parchment, primary, small } from '@/lib/circles/ui';

export const metadata: Metadata = {
  title: 'Circle Host Toolkit',
  description: 'Everything a volunteer host needs to start and run an SoE Circle: venue, first meeting, timekeeping and hard moments.',
};

const BEFORE: string[] = [
  'Book a free public room. Most public libraries lend meeting rooms to community groups; ask at the front desk. A quiet café corner works for up to six people.',
  'Pick a fixed weekday and time and keep it for all 12 weeks. Consistency matters more than the perfect slot.',
  'List the circle on Society of Explorers, then share the link yourself with friends, neighbours and the library noticeboard.',
  'Read week 1 and its guide, and choose the one question you will open with.',
];

const FIRST: string[] = [
  'Arrive ten minutes early. Put a book or a printed sign on the table so people can find you.',
  'Start on time, even if only two people are there.',
  'Read the community norms aloud (two minutes). Ask everyone to share a first name and why they came.',
  'Explain the weekly loop, then run it.',
  'End on time. Remind everyone of next week\u2019s reading and ask them to RSVP on the circle page.',
];

const HARD: Array<[string, string]> = [
  ['One person dominates', '\u201cLet\u2019s hear from someone who hasn\u2019t spoken yet.\u201d Then wait. Silence is fine.'],
  ['It turns into a political fight', 'Ask each side to state the other\u2019s view in a way the other would accept. Then return to the text: \u201cWhat does the author say?\u201d'],
  ['Someone is upset', 'Pause, acknowledge it plainly, and offer a short break. Nobody has to keep talking about something painful.'],
  ['Someone breaks the norms', 'Remind the group of the norm once, kindly. If it continues, ask the person to leave and use the Report button afterwards.'],
  ['Nobody comes', 'It happens. Read the passage yourself, post a note in the circle discussion, and try again next week. Most circles grow by word of mouth.'],
];

export default function CircleHostPage() {
  return (
    <div style={page}>
      <PublicNav />
      <main id="main" style={main}>
        <p style={label}><Link href="/circles" style={{ color: gold }}>Circles</Link> · Host toolkit</p>
        <h1 style={h1}>Host toolkit</h1>
        <p style={lead}>
          A host is not a teacher. Your job is to book the room, keep time, open with a question and make sure everyone
          gets a turn. You do not need to have read the books before.
        </p>

        <h2 style={h2}>Before the first meeting</h2>
        <ol style={{ ...body, paddingLeft: '1.4rem' }}>{BEFORE.map((s) => <li key={s} style={{ marginBottom: '0.5rem' }}>{s}</li>)}</ol>

        <h2 style={h2}>The first meeting</h2>
        <ol style={{ ...body, paddingLeft: '1.4rem' }}>{FIRST.map((s) => <li key={s} style={{ marginBottom: '0.5rem' }}>{s}</li>)}</ol>

        <h2 style={h2}>Every meeting (90 minutes)</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
          {WEEKLY_LOOP.map((s) => (
            <li key={s.step} style={card}>
              <p style={{ ...body, margin: 0 }}><strong style={{ color: parchment }}>{s.step}</strong> · {s.minutes} min. {s.detail}</p>
            </li>
          ))}
        </ul>

        <h2 style={h2}>Hard moments</h2>
        <ul style={{ ...body, paddingLeft: '1.2rem' }}>
          {HARD.map(([t, d]) => <li key={t} style={{ marginBottom: '0.6rem' }}><strong style={{ color: parchment }}>{t}.</strong> {d}</li>)}
        </ul>

        <h2 style={h2}>What hosts agree to</h2>
        <ul style={{ ...body, paddingLeft: '1.2rem' }}>
          <li>Meet only in public places, and follow the <Link href="/circles/norms" style={{ color: gold }}>community norms</Link>.</li>
          <li>Keep members&rsquo; contact details private and never add them to other lists.</li>
          <li>Keep circles free. Hosts may not charge members or sell to them.</li>
          <li>Host at most three circles at once.</li>
        </ul>
        <p style={small}>Hosts are volunteers, not employees or agents of Society of Explorers.</p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '2rem' }}>
          <Link href="/circles/start" style={primary}>Start a circle</Link>
          <Link href="/circles/path/1" style={button}>Read the week 1 guide</Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
